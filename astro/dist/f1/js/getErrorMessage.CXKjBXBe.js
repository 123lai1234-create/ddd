const n=(s,e)=>{const t=s&&typeof s=="object"&&"responseMessage"in s?String(s.responseMessage||""):"",g=s&&typeof s=="object"&&"msg"in s?String(s.msg||""):"";return t||g||e};export{n as g};
