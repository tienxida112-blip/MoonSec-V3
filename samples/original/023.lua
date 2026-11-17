-- MoonSec V3 sample 023
-- Kruskal MST
local edges = {{1,2,4},{1,3,3},{2,3,1},{2,4,2},{3,4,4},{3,5,6},{4,5,5},{4,6,7},{5,6,3}}
table.sort(edges, function(a,b) return a[3] < b[3] end)
local p = {}
for i = 1, 6 do p[i] = i end
local function find(x) while p[x] ~= x do p[x] = p[p[x]]; x = p[x] end; return x end
local cost, used = 0, 0
for _, e in ipairs(edges) do
  local a, b = find(e[1]), find(e[2])
  if a ~= b then p[a] = b; cost = cost + e[3]; used = used + 1 end
end
print(cost, used)

