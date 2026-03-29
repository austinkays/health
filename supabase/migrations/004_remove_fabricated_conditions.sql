-- Migration 004: Remove AI-hallucinated conditions from Amber's imported data
-- These two conditions were fabricated by the LLM during the comprehensive JSON export.
-- Amber does not have a history of GI surgery or rectal bleeding.
-- We target by sync_id (stable identifier) rather than by name for reliability.

DELETE FROM conditions
WHERE sync_id IN ('mcp-cond-rectalbleed001', 'mcp-cond-gisurg001');

-- Fallback: also delete by name in case sync_id column wasn't populated
DELETE FROM conditions
WHERE name IN ('History of rectal bleeding', 'History of GI surgery');
