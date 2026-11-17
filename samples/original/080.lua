-- MoonSec V3 sample 080
-- Z-algorithm sum
local s = "aabcaabxaaaz"
local n = #s
local z = {0}
local l, r = 0, 0
for i = 2, n do
  z[i] = 0
  if i <= r then z[i] = math.min(r-i+1, z[i-l+1]) end
  while i+z[i] <= n and s:sub(z[i]+1, z[i]+1) == s:sub(i+z[i], i+z[i]) do
    z[i] = z[i] + 1
  end
  if i+z[i]-1 > r then l = i; r = i+z[i]-1 end
end
local sm = 0
for i = 2, n do sm = sm + z[i] end
print(sm)

