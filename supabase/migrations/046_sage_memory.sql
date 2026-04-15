-- Sage Memory: persistent conversational memory for the AI companion.
-- Stores extracted facts/preferences from chat sessions so Sage remembers
-- across conversations. Premium-only feature, injected into AI profile context.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sage_memory text DEFAULT '';
