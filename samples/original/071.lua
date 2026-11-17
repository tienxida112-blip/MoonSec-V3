-- MoonSec V3 sample 071
-- Decision stump on 1D labels
local x = {1,2,3,4,5,6,7,8,9,10}
local y = {-1,-1,-1,-1,1,1,1,1,1,-1}
local best, thr, pol = 1e9, 0, 1
for i = 1, #x-1 do
  local t = (x[i]+x[i+1])/2
  for p = -1, 1, 2 do
    local err = 0
    for j = 1, #x do
      local pred = (x[j] < t) and p or -p
      if pred ~= y[j] then err = err + 1 end
    end
    if err < best then best = err; thr = t; pol = p end
  end
end
print(best, math.floor(thr*10), pol)

