-- MoonSec V3 sample 059
-- N-queens count for n=7
local n = 7
local col, d1, d2, sols = {}, {}, {}, 0
local function place(r)
  if r > n then sols = sols + 1; return end
  for c = 1, n do
    if not col[c] and not d1[r-c] and not d2[r+c] then
      col[c], d1[r-c], d2[r+c] = true, true, true
      place(r+1)
      col[c], d1[r-c], d2[r+c] = nil, nil, nil
    end
  end
end
place(1)
print(sols)

