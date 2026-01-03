-- Migration: Add Project Type Support
-- This migration adds support for multiple project types (interlinear and verb_table)
-- Run this in your Supabase SQL Editor

-- Add project_type column with default value
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'interlinear';

-- Add constraint to ensure valid project types
ALTER TABLE projects
ADD CONSTRAINT valid_project_type
CHECK (project_type IN ('interlinear', 'verb_table'));

-- Create index for filtering by type
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(project_type);

-- Update any existing NULL values to 'interlinear' (if needed)
UPDATE projects
SET project_type = 'interlinear'
WHERE project_type IS NULL;
