-- MoonSec V3 sample 085
-- Interpolation search hits
local a = {}
for i = 1, 50 do a[i] = i * 3 end
local function isearch(x)
  local lo, hi = 1, #a
  while lo <= hi and x >= a[lo] and x <= a[hi] do
    if lo == hi then return a[lo] == x and lo or -1 end
    local pos = lo + math.floor((x - a[lo]) * (hi - lo) / (a[hi] - a[lo]))
    if a[pos] == x then return pos
    elseif a[pos] < x then lo = pos + 1
    else hi = pos - 1 end
  end
  return -1
end
local hits = 0
for x = 0, 160, 3 do if isearch(x) > 0 then hits = hits + 1 end end
print(hits)

