-- MoonSec V3 sample 021
-- Floyd-Warshall on 6 nodes
local inf = 1e9
local n = 6
local d = {}
for i = 1, n do
  d[i] = {}
  for j = 1, n do d[i][j] = (i==j) and 0 or inf end
end
local edges = {{1,2,7},{1,3,9},{1,6,14},{2,3,10},{2,4,15},{3,4,11},{3,6,2},{4,5,6},{5,6,9}}
for _, e in ipairs(edges) do
  d[e[1]][e[2]] = e[3]; d[e[2]][e[1]] = e[3]
end
for k = 1, n do
  for i = 1, n do
    for j = 1, n do
      local t = d[i][k] + d[k][j]
      if t < d[i][j] then d[i][j] = t end
    end
  end
end
local s = 0
for i = 1, n do for j = i+1, n do s = s + d[i][j] end end
print(s)

