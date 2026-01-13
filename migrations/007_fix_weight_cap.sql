-- Migration 007: Fix weight cap in update_edge_weight function
-- Prevents unbounded weight growth by capping at 100

CREATE OR REPLACE FUNCTION update_edge_weight(
  p_from_handle TEXT,
  p_to_handle TEXT,
  p_edge_type TEXT,
  p_base_weight REAL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO graph_edges (from_handle, to_handle, edge_type, weight, interaction_count)
  VALUES (p_from_handle, p_to_handle, p_edge_type, LEAST(p_base_weight, 100), 1)
  ON CONFLICT (from_handle, to_handle, edge_type) DO UPDATE SET
    -- Cap weight at 100 to prevent unbounded growth
    weight = LEAST(
      graph_edges.weight + (p_base_weight * POWER(0.95, EXTRACT(EPOCH FROM (NOW() - graph_edges.last_interaction_at)) / 604800)),
      100
    ),
    interaction_count = graph_edges.interaction_count + 1,
    last_interaction_at = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_edge_weight IS 'Upserts edge with time-decayed weight accumulation (capped at 100)';
