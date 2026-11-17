-- MoonSec V3 sample 069
-- 1D k-means two clusters
local x = {1,2,3,8,9,10,11,2.5,9.5,0.5}
local c1, c2 = 0, 10
for _ = 1, 12 do
  local s1, n1, s2, n2 = 0, 0, 0, 0
  for i = 1, #x do
    if math.abs(x[i]-c1) <= math.abs(x[i]-c2) then s1 = s1 + x[i]; n1 = n1 + 1
    else s2 = s2 + x[i]; n2 = n2 + 1 end
  end
  if n1 > 0 then c1 = s1 / n1 end
  if n2 > 0 then c2 = s2 / n2 end
end
print(math.floor(c1*100+0.5), math.floor(c2*100+0.5))

