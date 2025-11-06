// Shared Router Module

/**
 * Parse share code and text index from hash
 * Supports patterns: #p/SHARECODE or #p/SHARECODE/text/0
 */
export function parseInterlinearHash(hash) {
  if (!hash || !hash.includes('#p/')) return null;

  const hashMatch = hash.match(/#p\/([A-Z0-9]+)(?:\/text\/(\d+))?/i);
  if (hashMatch) {
    return {
      shareCode: hashMatch[1],
      textIndex: hashMatch[2] ? parseInt(hashMatch[2], 10) : 0
    };
  }

  // Fallback parsing
  const shareCode = hash.split('#p/')[1].split('?')[0].split('/')[0].trim();
  return {
    shareCode,
    textIndex: 0
  };
}

/**
 * Parse share code and table index from hash
 * Supports patterns: #vt/SHARECODE or #vt/SHARECODE/table/0
 */
export function parseVerbTableHash(hash) {
  if (!hash || !hash.includes('#vt/')) return null;

  const hashMatch = hash.match(/#vt\/([A-Z0-9]+)(?:\/table\/(\d+))?/i);
  if (hashMatch) {
    return {
      shareCode: hashMatch[1],
      tableIndex: hashMatch[2] ? parseInt(hashMatch[2], 10) : 0
    };
  }

  // Fallback parsing
  const shareCode = hash.split('#vt/')[1].split('?')[0].split('/')[0].trim();
  return {
    shareCode,
    tableIndex: 0
  };
}

/**
 * Build interlinear hash URL
 */
export function buildInterlinearHash(shareCode, textIndex = 0) {
  if (textIndex > 0) {
    return `#p/${shareCode}/text/${textIndex}`;
  }
  return `#p/${shareCode}`;
}

/**
 * Build verb table hash URL
 */
export function buildVerbTableHash(shareCode, tableIndex = 0) {
  if (tableIndex > 0) {
    return `#vt/${shareCode}/table/${tableIndex}`;
  }
  return `#vt/${shareCode}`;
}

/**
 * Detect project type from hash
 */
export function getProjectTypeFromHash(hash) {
  if (hash.includes('#p/')) return 'interlinear';
  if (hash.includes('#vt/')) return 'verb_table';
  return null;
}

/**
 * Navigate to URL with hash
 */
export function navigateTo(hash) {
  window.location.hash = hash;
}

/**
 * Navigate to home
 */
export function navigateHome() {
  window.location.hash = '';
}
