-- MoonSec V3 sample 064
-- Zeller congruence weekday histogram
local function weekday(y, m, d)
  if m < 3 then m = m + 12; y = y - 1 end
  local K, J = y % 100, math.floor(y / 100)
  local h = (d + math.floor(13*(m+1)/5) + K + math.floor(K/4) + math.floor(J/4) + 5*J) % 7
  return h
end
local hist = {}
for i = 0, 6 do hist[i] = 0 end
for y = 2000, 2020 do
  for m = 1, 12 do
    hist[weekday(y, m, 1)] = hist[weekday(y, m, 1)] + 1
  end
end
local s = 0
for i = 0, 6 do s = s + hist[i] * (i+1) end
print(s)

