-- MoonSec V3 sample 018
-- Patience LIS length
local a = {3,1,4,1,5,9,2,6,5,3,5,8,9,7,9}
local piles = {}
for i = 1, #a do
  local x, lo, hi = a[i], 1, #piles
  while lo <= hi do
    local mid = math.floor((lo+hi)/2)
    if piles[mid] < x then lo = mid + 1 else hi = mid - 1 end
  end
  piles[lo] = x
end
print(#piles, piles[#piles])

