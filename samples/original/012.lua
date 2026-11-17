-- MoonSec V3 sample 012
-- LSD radix sort base 10
local a = {329,457,657,839,436,720,355,0,12,99,1000,5}
local maxv = 0
for i = 1, #a do if a[i] > maxv then maxv = a[i] end end
local exp = 1
while math.floor(maxv / exp) > 0 do
  local bkt = {}
  for d = 0, 9 do bkt[d] = {} end
  for i = 1, #a do
    local d = math.floor(a[i] / exp) % 10
    bkt[d][#bkt[d]+1] = a[i]
  end
  local k = 1
  for d = 0, 9 do
    for i = 1, #bkt[d] do a[k] = bkt[d][i]; k = k + 1 end
  end
  exp = exp * 10
end
print(a[1], a[#a], a[6])

