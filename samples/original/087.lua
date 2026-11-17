-- MoonSec V3 sample 087
-- 15-puzzle manhattan sum of a scramble
local board = {5,1,2,3, 9,6,7,4, 13,10,11,8, 0,14,15,12}
local function manhattan()
  local s = 0
  for i = 1, 16 do
    local v = board[i]
    if v ~= 0 then
      local r, c = math.floor((i-1)/4), (i-1)%4
      local tr, tc = math.floor((v-1)/4), (v-1)%4
      s = s + math.abs(r-tr) + math.abs(c-tc)
    end
  end
  return s
end
print(manhattan())

