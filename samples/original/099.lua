-- MoonSec V3 sample 099
-- Calendar day-of-year + leap
local function leap(y)
  return (y % 4 == 0 and y % 100 ~= 0) or (y % 400 == 0)
end
local md = {31,28,31,30,31,30,31,31,30,31,30,31}
local function doy(y,m,d)
  local s = d
  for i = 1, m-1 do s = s + md[i] end
  if m > 2 and leap(y) then s = s + 1 end
  return s
end
local acc = 0
for y = 1990, 2020 do acc = acc + doy(y, 8, 15) + (leap(y) and 1 or 0) end
print(acc)

