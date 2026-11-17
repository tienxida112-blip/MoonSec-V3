-- MoonSec V3 sample 027
-- Union-find max component with path compression
local n = 20
local p, sz = {}, {}
for i = 1, n do p[i] = i; sz[i] = 1 end
local function find(x)
  local r = x
  while p[r] ~= r do r = p[r] end
  while p[x] ~= x do local n2 = p[x]; p[x] = r; x = n2 end
  return r
end
local function unite(a,b)
  a, b = find(a), find(b)
  if a == b then return end
  if sz[a] < sz[b] then a, b = b, a end
  p[b] = a; sz[a] = sz[a] + sz[b]
end
local pairs = {{1,2},{2,3},{4,5},{5,6},{6,7},{1,8},{9,10},{11,12},{12,13},{8,4},{14,15}}
for _, q in ipairs(pairs) do unite(q[1], q[2]) end
local mx = 0
for i = 1, n do if sz[find(i)] > mx then mx = sz[find(i)] end end
print(mx)

