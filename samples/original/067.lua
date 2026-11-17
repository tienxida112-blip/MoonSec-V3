-- MoonSec V3 sample 067
-- Interval merge then coverage
local iv = {{1,4},{2,5},{7,9},{8,10},{3,3},{12,14},{0,1}}
table.sort(iv, function(a,b) return a[1] < b[1] end)
local m = {iv[1]}
for i = 2, #iv do
  local last = m[#m]
  if iv[i][1] <= last[2] then
    if iv[i][2] > last[2] then last[2] = iv[i][2] end
  else m[#m+1] = {iv[i][1], iv[i][2]} end
end
local cov = 0
for i = 1, #m do cov = cov + (m[i][2] - m[i][1]) end
print(#m, cov)

