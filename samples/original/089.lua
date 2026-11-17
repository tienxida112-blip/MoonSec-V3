-- MoonSec V3 sample 089
-- AABB sweep: count overlapping pairs
local boxes = {
  {0,0,2,2},{1,1,3,3},{4,0,5,1},{2,2,6,6},{5,5,7,8},{10,10,11,11}
}
local function overlap(a,b)
  return a[1] < b[3] and b[1] < a[3] and a[2] < b[4] and b[2] < a[4]
end
local n = 0
for i = 1, #boxes do
  for j = i+1, #boxes do
    if overlap(boxes[i], boxes[j]) then n = n + 1 end
  end
end
print(n)

