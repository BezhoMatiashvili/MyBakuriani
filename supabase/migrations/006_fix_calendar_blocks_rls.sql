-- Ensure calendar owners can insert/update/delete rows via upsert.
DROP POLICY IF EXISTS "Owners can manage calendar" ON calendar_blocks;

CREATE POLICY "Owners can view own calendar"
ON calendar_blocks
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM properties
    WHERE id = calendar_blocks.property_id
      AND owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can insert own calendar blocks"
ON calendar_blocks
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM properties
    WHERE id = calendar_blocks.property_id
      AND owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can update own calendar blocks"
ON calendar_blocks
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM properties
    WHERE id = calendar_blocks.property_id
      AND owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM properties
    WHERE id = calendar_blocks.property_id
      AND owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can delete own calendar blocks"
ON calendar_blocks
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM properties
    WHERE id = calendar_blocks.property_id
      AND owner_id = auth.uid()
  )
);
