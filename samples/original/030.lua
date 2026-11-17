-- MoonSec V3 sample 030
-- S-expression evaluator
local function parse(s)
  local i = 1
  local function skip() while s:sub(i,i):match("%s") do i = i + 1 end end
  local function read()
    skip()
    if s:sub(i,i) == "(" then
      i = i + 1; local t = {}
      skip()
      while s:sub(i,i) ~= ")" and i <= #s do t[#t+1] = read(); skip() end
      i = i + 1; return t
    else
      local j = i
      while i <= #s and not s:sub(i,i):match("[%s%(%)]") do i = i + 1 end
      local w = s:sub(j, i-1)
      return tonumber(w) or w
    end
  end
  return read()
end
local function ev(x)
  if type(x) ~= "table" then return x end
  local op = x[1]
  if op == "+" then return ev(x[2]) + ev(x[3])
  elseif op == "*" then return ev(x[2]) * ev(x[3])
  elseif op == "-" then return ev(x[2]) - ev(x[3])
  elseif op == "if" then if ev(x[2]) ~= 0 then return ev(x[3]) else return ev(x[4]) end
  else return 0 end
end
print(ev(parse("(* (+ 2 3) (if 1 7 9))")))

