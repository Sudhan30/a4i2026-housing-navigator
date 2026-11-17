WITH anchor AS (
  -- Anchor point = centroid of 311 rows on the tenant's block, else tract centroid
  SELECT COALESCE(
    (SELECT ST_GEOGPOINT(AVG(longitude), AVG(latitude))
       FROM `a4i_housing.municipal_311_housing_complaints`
      WHERE LOWER(block_address) LIKE CONCAT('%', LOWER(@block_hint), '%')
        AND @block_hint != ''),
    (SELECT ST_GEOGPOINT(longitude, latitude)
       FROM `a4i_housing.acs_tract_housing_tenure`
      WHERE census_tract_geoid = @tract_hint)
  ) AS pt
),
hits AS (
  SELECT query.query_text, base.*, distance
  FROM VECTOR_SEARCH(
    TABLE `a4i_housing.complaints_embedded`, 'embedding',
    (SELECT q AS query_text,
            AI.EMBED(q, connection_id => 'us.a4i-vertex',
                        endpoint => 'gemini-embedding-2').result AS query_vec
       FROM UNNEST(@queries) AS q),
    query_column_to_search => 'query_vec',
    top_k => 20,
    distance_type => 'COSINE',
    options => '{"use_brute_force":true}'
  )
)
SELECT
  h.request_id, h.block_address, h.census_tract_geoid, h.property_type,
  h.raw_complaint_type, h.inspection_status, h.created_date, h.closed_date,
  h.complaint_narrative, h.query_text,
  ROUND(1 - h.distance, 4) AS similarity,
  ROUND(ST_DISTANCE(ST_GEOGPOINT(h.longitude, h.latitude), (SELECT pt FROM anchor)), 0) AS meters_from_anchor,
  h.latitude, h.longitude,
  ST_Y((SELECT pt FROM anchor)) AS anchor_lat,
  ST_X((SELECT pt FROM anchor)) AS anchor_lng
FROM hits h
QUALIFY ROW_NUMBER() OVER (PARTITION BY h.request_id ORDER BY h.distance) = 1
ORDER BY h.distance;
