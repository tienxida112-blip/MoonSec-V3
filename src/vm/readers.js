'use strict';

// Shared higher-order reader dispatcher: bit extraction, byte/u32 readers,
// prototype lookup, and the callable stack table used by the VM.
function bitDispatcher() {
  return `function(e,n,l,d,t,o)
local o;
if e<=3 then
if e>=2 then
if e>0 then repeat
if e>2 then do return n(1),n(4,t,d,l,n),n(5,t,d,l) end;break;end
do return 0x1000000,0x10000,0x100 end;
until true;else do return 0x1000000,0x10000,0x100 end;end
else
if -1<=e then repeat
if 0~=e then do return function(l,e,n)
if n then local e=(l/2^(e-1))%2^((n-1)-(e-1)+1);return e-e%1
else local e=2^(e-1);return(l%(e+e)>=e)and 1 or 0 end
end end;break;end
do return n(1),n(4,t,d,l,n),n(5,t,d,l) end;
until true;else do return function(n,e,l)
if l then local e=(n/2^(e-1))%2^((l-1)-(e-1)+1);return e-e%1
else local e=2^(e-1);return(n%(e+e)>=e)and 1 or 0 end
end end;end
end
else
if 6<=e then
if 7<=e then
if 3<=e then repeat
if e~=8 then do return setmetatable({},{['__\\99\\97\\108\\108']=function(e,l,d,t,n)
if n then return e[n] elseif t then return e else e[l]=d end
end}) end break;end
do return l(e,nil,l) end
until true;else do return setmetatable({},{['__\\99\\97\\108\\108']=function(e,d,t,l,n)
if n then return e[n] elseif l then return e else e[d]=t end
end}) end end
else do return t[l] end
end
else
if e~=3 then for o=37,83 do
if 5>e then
local e=d
local f,a,t=t(2)
do return function()
local n,l,d,o=n(l,e(e,e),e(e,e)+3)
e(4)
return(o*f)+(d*a)+(l*t)+n
end end
break;end
local e=d
do return function()
local n=n(l,e(e,e),e(e,e))
e(1)
return n
end end
break;end
else
local e=d
do return function()
local n=n(l,e(e,e),e(e,e))
e(1)
return n
end end
end
end
end
end`;
}


module.exports = { bitDispatcher };
