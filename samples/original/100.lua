-- MoonSec V3 sample 100
-- Bitboard rook attacks on empty board from d4
local function bit(r,f) return 2^((r-1)*8+(f-1)) end
local att, r0, f0 = 0, 4, 4
for f = 1, 8 do if f ~= f0 then att = att + bit(r0,f) end end
for r = 1, 8 do if r ~= r0 then att = att + bit(r,f0) end end
local function pop(x)
  local n=0; while x>0 do n=n+x%2; x=math.floor(x/2) end; return n
end
print(pop(att))

