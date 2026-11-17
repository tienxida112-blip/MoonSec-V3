-- MoonSec V3 sample 009
-- In-place quicksort (Lomuto) then median
local a = {23,1,44,8,15,16,4,42,9,0,7,18,3,21,11,5,30,2,19,6}
local function qs(lo, hi)
  if lo >= hi then return end
  local p, i = a[hi], lo
  for j = lo, hi - 1 do
    if a[j] <= p then a[i], a[j] = a[j], a[i]; i = i + 1 end
  end
  a[i], a[hi] = a[hi], a[i]
  qs(lo, i - 1); qs(i + 1, hi)
end
qs(1, #a)
print(a[1], a[#a], a[math.floor((#a+1)/2)])

