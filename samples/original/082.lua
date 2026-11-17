-- MoonSec V3 sample 082
-- Bellman-Ford with a negative edge
local n = 5
local edges = {{1,2,6},{1,3,7},{2,3,8},{2,4,5},{2,5,-4},{3,4,-3},{3,5,9},{4,5,7},{5,2,2}}
local d = {}
for i = 1, n do d[i] = 1e9 end
d[1] = 0
for _ = 1, n-1 do
  for _, e in ipairs(edges) do
    if d[e[1]] + e[3] < d[e[2]] then d[e[2]] = d[e[1]] + e[3] end
  end
end
local s = 0
for i = 1, n do s = s + d[i] end
print(s)

