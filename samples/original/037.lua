-- MoonSec V3 sample 037
-- Determinant via expansion
local function det(M)
  local n = #M
  if n == 1 then return M[1][1] end
  if n == 2 then return M[1][1]*M[2][2] - M[1][2]*M[2][1] end
  local s = 0
  for j = 1, n do
    local m = {}
    for i = 2, n do
      local row = {}
      for k = 1, n do if k ~= j then row[#row+1] = M[i][k] end end
      m[#m+1] = row
    end
    local sign = (j % 2 == 1) and 1 or -1
    s = s + sign * M[1][j] * det(m)
  end
  return s
end
print(det({{6,1,1},{4,-2,5},{2,8,7}}))

