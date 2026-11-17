-- MoonSec V3 sample 011
-- Bottom-up merge sort
local a = {5,2,9,1,7,3,8,4,6,0,11,10}
local function merge(src, dst, lo, mid, hi)
  local i, j = lo, mid
  for k = lo, hi - 1 do
    if i < mid and (j >= hi or src[i] <= src[j]) then dst[k] = src[i]; i = i + 1
    else dst[k] = src[j]; j = j + 1 end
  end
end
local n, src, dst = #a, a, {}
local width = 1
while width < n do
  for i = 1, n, width * 2 do
    local lo, mid, hi = i, math.min(i+width, n+1), math.min(i+width*2, n+1)
    merge(src, dst, lo, mid, hi)
  end
  src, dst, width = dst, src, width * 2
end
local s = 0
for i = 1, n do s = s + src[i] * (i+3) end
print(s)

