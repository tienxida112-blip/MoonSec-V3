-- MoonSec V3 sample 028
-- Recursive-descent arithmetic evaluator
local s, pos = "2*(3+4*5)-6/(1+1)", 1
local function peek() return s:sub(pos,pos) end
local function eat() local c = peek(); pos = pos + 1; return c end
local expr
local function num()
  local v = 0
  while peek():match("%d") do v = v * 10 + tonumber(eat()) end
  return v
end
local function factor()
  if peek() == "(" then eat(); local v = expr(); eat(); return v end
  return num()
end
local function term()
  local v = factor()
  while peek() == "*" or peek() == "/" do
    local op = eat()
    local r = factor()
    if op == "*" then v = v * r else v = v / r end
  end
  return v
end
expr = function()
  local v = term()
  while peek() == "+" or peek() == "-" do
    local op = eat()
    local r = term()
    if op == "+" then v = v + r else v = v - r end
  end
  return v
end
print(expr())

