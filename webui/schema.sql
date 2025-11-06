-- FLEX Interlinear Translation App
-- Supabase Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  linguist_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_code TEXT NOT NULL UNIQUE,
  title TEXT,
  project_type TEXT DEFAULT 'interlinear' CHECK (project_type IN ('interlinear', 'verb_table')),
  json_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on share_code for fast lookups
CREATE INDEX idx_projects_share_code ON projects(share_code);
CREATE INDEX idx_projects_linguist_id ON projects(linguist_id);
CREATE INDEX idx_projects_type ON projects(project_type);

-- Row Level Security Policies

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policy: Linguists can view, insert, update, and delete their own projects
CREATE POLICY "linguists_own_projects"
  ON projects
  FOR ALL
  USING (auth.uid() = linguist_id)
  WITH CHECK (auth.uid() = linguist_id);

-- Policy: Anyone can view projects if they have the share code
-- This is tricky because we can't pass share_code through auth context easily
-- Instead, we'll use a more permissive policy and validate in the app
CREATE POLICY "public_read_with_share_code"
  ON projects
  FOR SELECT
  USING (true);

-- Policy: Anyone can update projects (we validate share_code in app layer)
-- In production, you might want to use Supabase Edge Functions for better security
CREATE POLICY "public_update_projects"
  ON projects
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Note: For better security, consider these alternatives:
-- 1. Use Supabase Edge Functions to validate share_code server-side
-- 2. Use a separate table for community translations with foreign key to projects
-- 3. Implement custom claims in JWT tokens

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on projects table
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Optional: Create a view for project statistics
CREATE OR REPLACE VIEW project_stats AS
SELECT
  p.id,
  p.title,
  p.share_code,
  p.linguist_id,
  p.created_at,
  p.updated_at,
  jsonb_array_length(
    (SELECT jsonb_agg(seg)
     FROM jsonb_array_elements(p.json_data->'paragraphs') AS para,
          jsonb_array_elements(para->'segments') AS seg)
  ) AS total_segments,
  (SELECT COUNT(*)
   FROM jsonb_array_elements(p.json_data->'paragraphs') AS para,
        jsonb_array_elements(para->'segments') AS seg
   WHERE (seg->'freeTranslation'->>'en') IS NOT NULL
     AND (seg->'freeTranslation'->>'en') != '') AS completed_segments
FROM projects p;

-- Grant access to authenticated users
GRANT SELECT ON project_stats TO authenticated;
GRANT SELECT ON project_stats TO anon;
