-- MoonSec V3 sample 029
-- Shunting-yard to RPN then eval
local tokens = {"3","+","4","*","2","/","(","1","-","5",")","^","2"}
local prec = {["+"]=1,["-"]=1,["*"]=2,["/"]=2,["^"]=3}
local right = {["^"]=true}
local out, ops = {}, {}
for _, t in ipairs(tokens) do
  if tonumber(t) then out[#out+1] = t
  elseif t == "(" then ops[#ops+1] = t
  elseif t == ")" then
    while ops[#ops] ~= "(" do out[#out+1] = ops[#ops]; ops[#ops] = nil end
    ops[#ops] = nil
  else
    while #ops > 0 and ops[#ops] ~= "(" and
      (prec[ops[#ops]] > prec[t] or (prec[ops[#ops]] == prec[t] and not right[t])) do
      out[#out+1] = ops[#ops]; ops[#ops] = nil
    end
    ops[#ops+1] = t
  end
end
while #ops > 0 do out[#out+1] = ops[#ops]; ops[#ops] = nil end
local st = {}
for _, t in ipairs(out) do
  if tonumber(t) then st[#st+1] = tonumber(t)
  else
    local b, a = st[#st], st[#st-1]; st[#st] = nil; st[#st] = nil
    if t == "+" then st[#st+1] = a+b
    elseif t == "-" then st[#st+1] = a-b
    elseif t == "*" then st[#st+1] = a*b
    elseif t == "/" then st[#st+1] = a/b
    else st[#st+1] = a^b end
  end
end
print(math.floor(st[1] * 1000 + 0.5))

