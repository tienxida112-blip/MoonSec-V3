-- MoonSec V3 sample 013
-- Binary search over a generated table
local a = {}
for i = 1, 64 do a[i] = i * i - 7 end
local function bsearch(x)
  local lo, hi = 1, #a
  while lo <= hi do
    local m = math.floor((lo+hi)/2)
    if a[m] == x then return m
    elseif a[m] < x then lo = m + 1
    else hi = m - 1 end
  end
  return -1
end
local hits = 0
for x = 0, 200, 13 do
  if bsearch(x) > 0 then hits = hits + 1 end
end
print(hits, bsearch(a[20]))

