-- MoonSec V3 sample 008
-- Insertion sort + inversion count
local a = {9,1,8,2,7,3,6,4,5,0,11,10,14,13,12}
local inv, n = 0, #a
for i = 2, n do
  local key, j = a[i], i - 1
  while j >= 1 and a[j] > key do
    a[j+1] = a[j]; inv = inv + 1; j = j - 1
  end
  a[j+1] = key
end
local s = 0
for i = 1, n do s = s + a[i] * i end
print(s, inv)

