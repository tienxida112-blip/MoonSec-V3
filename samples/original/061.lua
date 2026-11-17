-- MoonSec V3 sample 061
-- Tower of Hanoi move count via recursion
local moves = 0
local function hanoi(n, a, b, c)
  if n == 0 then return end
  hanoi(n-1, a, c, b)
  moves = moves + 1
  hanoi(n-1, c, b, a)
end
hanoi(10, 1, 3, 2)
print(moves)

