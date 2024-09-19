const express = require('express');
const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const FormData = require('form-data');
const CryptoJS = require('crypto-js');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const { JSDOM } = require('jsdom');

const encryptionKey = process.env.encryptionkey;

const app = express();
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 5 minutes
    max: 1000000, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    headers: true, // Adds RateLimit headers to responses
  });


const taskMap = new Map();

app.use(express.json());
app.use(cors());
app.use(limiter);

function decryptDetails(req){
    const bytes = CryptoJS.AES.decrypt(req.body.credentials.password, encryptionKey);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    const details=req.body;
    details.credentials.password=originalText;
    console.log(details)
    details.domain = details.domain.endsWith('/') ? details.domain.slice(0, -1) : details.domain;
    return(details)
}


function parseFormData(loginPage) {
    const dom = new JSDOM(loginPage);
    const document = dom.window.document;

    const viewStateElement = document.getElementById('__VIEWSTATE');
    const eventValidationElement = document.getElementById('__EVENTVALIDATION');

    const _VIEWSTATE = viewStateElement ? viewStateElement.value : null;
    const _EVENTVALIDATION = eventValidationElement ? eventValidationElement.value : null;
    console.log(_VIEWSTATE);console.log(_EVENTVALIDATION);

    return [_VIEWSTATE, _EVENTVALIDATION];
}



async function logIn(details,session) {
    try{
    return new Promise(async (res, rej)=>{
    const url = details.domain+"/PXP2_Login_Student.aspx?regenerateSessionId=True";
    const response2 = await axios.get(url)
    const [VIEWSTATE, EVENTVALIDATION]=parseFormData(response2.data);
    const data = new FormData();
    data.append('__VIEWSTATE', VIEWSTATE);
    data.append('__EVENTVALIDATION', EVENTVALIDATION);
    data.append('ctl00$MainContent$username', details.credentials.username);
    data.append('ctl00$MainContent$password', details.credentials.password);
    data.append('ctl00$MainContent$Submit1', 'Login');

        
    const headers = {
        'Origin': details.domain,
        'Referer': details.domain + '/PXP2_Login_Student.aspx?Logout=1&regenerateSessionId=True',
        ...(details.cookies && { 'Cookie': details.cookies })
    };
    
        console.log(url);console.log(data);console.log(headers);
        await session.post(url, data, { headers })
            .then(login =>{
        console.log(login.status);
        console.log(login.statusText);
        if (login.data.includes("Good")){
            console.log("Logged in");
            res();
        } else {
        rej(new Error("Incorrect Username or Password"))
        };}).catch(err=>{if(err.message.includes("hung up")||err.message.includes("ENOTFOUND")){rej(new Error("Network Error: Try Again Shortly"))}})

})}catch(error){return({status:false,message:error.message})}}


app.post('/getStudentPhoto',async (req, res)=>{
    try{
    const details=decryptDetails(req);;
    console.log(details)
    new Promise(async(res,rej)=>{
        await axios.get(details.domain+"/"+details.url,{headers:{
            "Referer":details.domain+"/PXP2_Documents.aspx?AGU=0","Cookie":details.cookies},responseType: 'arraybuffer' })
            .then(file=>{
                console.log("YIPEE")
                console.log("Content-Type:", file.headers['content-type']);
                res(file.data)

            })
            .catch(error=>{
                console.log("oh no")
                if(error.message.includes("403")){rej(new Error("Link/Authentication Expired"))}
                if(error.message.includes("hung up")||error.message.includes("ENOTFOUND")){rej(new Error("Network Error: Try Again Shortly"))}
                console.error(error.message);
                rej(error);
            })
    }).then(res1=>{res.json({status:true,photo:res1});}).catch(error=>{
        res.json({status:false,message:error.message})})

}catch(error){res.json({status:false,message:error.message})}})



app.post("/getStudentInfo",async(req,res)=>{
    try{
    const details=decryptDetails(req);;
    new Promise(async(res,rej)=>{
        details.headers.Cookie=details.cookies;
        console.log("print debug")
        console.log(details.headers)
        await axios.get(details.domain+"/"+"PXP2_Student.aspx?AGU=0",{'headers':details.headers})
            .then(page=>{
                console.log("type shit")
                res(page.data)
            })
            .catch(error=>{
                if(error.message.includes("hung up")||error.message.includes("ENOTFOUND")){rej(new Error("Network Error: Try Again Shortly"))}
                console.error(error)
                rej(error)
            })
    }).then(res1=>{res.json({status:true,info:res1});}).catch(error=>{
        res.json({status:false,message:error.message})})

}catch(error){res.json({status:false,message:error.message})}})


app.post("/getDocument",async(req,res)=>{
    try{
    const details=decryptDetails(req);;
    console.log(details)
    new Promise(async(res,rej)=>{
        console.log("here we go i guess!!!")
        await axios.get(details.domain+"/"+details.url,{headers:{"Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-User": "?1",
            "Sec-Fetch-Dest": "document",
            "Referer":details.domain+"/PXP2_Documents.aspx?AGU=0","Cookie":details.cookies},responseType: 'arraybuffer' })
            .then(file=>{
                console.log("YIPEE")
                console.log("Content-Type:", file.headers['content-type']);
                if(file.headers['content-type']=="application/pdf"){
                console.log(file.data.data)
                res(file.data);}else{rej(new Error("Unknown Error"))}

            })
            .catch(error=>{
                console.log("oh no")
                if(error.message.includes("403")){rej(new Error("Link/Authentication Expired"))}
                if(error.message.includes("hung up")||error.message.includes("ENOTFOUND")){rej(new Error("Network Error: Try Again Shortly"))}
                console.error(error.message);
                rej(error);
            })
    }).then(res1=>{res.json({status:true,doc:res1});}).catch(error=>{
        res.json({status:false,message:error.message})})
}catch(error){res.json({status:false,message:error.message})}})


app.post("/getDocuments",async(req,res)=>{
    try{
    const details=decryptDetails(req);;
    new Promise(async(res,rej)=>{
            try{
            const url = details.domain+"/PXP2_Documents.aspx?AGU=0";
            console.log("here we go!!!")
            await axios.get(url,{headers:{"Cookie":details.cookies}})
                .then(response=>{
                    if(response.data.includes("ParentVUE and StudentVUE Access")){rej(new Error("Authentication Cookies Expired"))};
                    res(response.data);
                                })
                .catch(err=>{
                    if(err.message.includes("hung up")||err.message.includes("ENOTFOUND")){rej(new Error("Network Error: Try Again Shortly"))}
                console.log(err)
                rej(err)})
    
    
        }
        catch(error){
        console.log("okay now I'm confused")
        rej(error)}
        }).then(res1=>{res.json({status:true,doc:res1});}).catch(error=>{
            res.json({status:false,message:error.message})})

}catch(error){res.json({status:false,message:error.message})}})



app.post("/getHomePageGrades",async(req,res)=>{
    new Promise(async (res, rej)=>{
    const details=req.body;
    const url = details.domain+'/api/GB/ClientSideData/Transfer?action=genericdata.classdata-GetClassData';
    const data = new URLSearchParams({
        'FriendlyName': 'genericdata.classdata',
        'Method': 'GetClassData',
        'Parameters': '{}'
    });
    const headers = {
        'Origin': details.domain,
        'Referer': details.domain+'/PXP2_GradeBook.aspx?AGU=0',
        'Cookie':details.cookies
    };

        await axios.get(details.domain+"/PXP2_GradeBook.aspx?AGU=0"+details.selector,{headers:headers})
        .then(response=>{
            if(response.data.includes("Internal Serer Error")){return rej(new Error("Authentication Cookies Expired"))};
            res(response.data);
        })
        .catch(error=>{
            if(error.message.includes("hung up")||error.message.includes("ENOTFOUND")){return rej(new Error("Network Error: Try Again Shortly"))}
            rej(new Error(error))})
        //const response = await session.post(url, data, { headers });

}).then(res1=>{res.json({status:true,grades:res1});}).catch(error=>{
    res.status(200).json({status:false,message:error.message})})

});


async function getAssignments(details){
    return new Promise(async(res,rej)=>{
   console.log(details.senddata);
    try{
            const headers = {
    'Origin': details.domain,
    'Referer': details.domain+'/PXP2_GradeBook.aspx?AGU=0',
    'Cookie':details.cookies
};
console.log(headers)
    await axios.post(details.domain+"/service/PXP2Communication.asmx/LoadControl",details.senddata,{headers:headers})
     var response3 = await axios.post(details.domain+"/api/GB/ClientSideData/Transfer?action=genericdata.classdata-GetClassData",{"FriendlyName":"genericdata.classdata","Method":"GetClassData","Parameters":"{}"},{headers:headers}).catch(error=>{if(error.message.includes("404")){console.log("it's me response 3");
        var response3=null}});
        var response2= await axios.post(details.domain+"/api/GB/ClientSideData/Transfer?action=pxp.course.content.items-LoadWithOptions", {"FriendlyName":"pxp.course.content.items","Method":"LoadWithOptions","Parameters":"{\"loadOptions\":{\"sort\":[{\"selector\":\"due_date\",\"desc\":false}],\"filter\":[[\"isDone\",\"=\",false]],\"group\":[{\"Selector\":\"Week\",\"desc\":true}],\"requireTotalCount\":true,\"userData\":{}},\"clientState\":{}}"},{headers:headers}).catch(error=>{if(error.message.includes("404")){console.log("is this just for show or what?");
            var response2=null}});
    
}
    catch(error){console.log(error.message);
        return rej(error)}
    
        const response3Data = response3 ? response3.data : "null";
        const response2Data = response2 ? response2.data : "null";
        res([response3Data, response2Data]);
})}

app.post("/getAssignments",async(req,res)=>{
    return new Promise(async (res, rej)=>{ 
        var details=req.body;
        console.log(taskMap);
        if(taskMap.has(details.cookies)){
            await taskMap.get(details.cookies);
        }
    try {
        taskMap.set(details.cookies,getAssignments(details));

    
            const result = await taskMap.get(details.cookies);
            taskMap.delete(details.cookies);
            return res(result)
        } catch (error) {
            taskMap.delete(details.cookies);
            return rej(error)
        }
        // response = await session.post(url, data, { headers });
        console.log("what's my name? hiesenburger")


    }).then(res1=>{res.json({status:true,assignments:res1});}).catch(error=>{
        res.status(200).json({status:false,message:error.message})})

});




app.post("/refresh",async(req,res)=>{
   console.log(req.body);
    try{
    console.log("listen here, jackass")
    console.log(req.body);
    if(req.body.needsDecryption==true){var details=decryptDetails(req);}else{var details=req.body;}
    new Promise(async (res, rej)=>{
        details.domain = details.domain.endsWith('/') ? details.domain.slice(0, -1) : details.domain;
       const cookieJar = new tough.CookieJar();
        const session = await wrapper(axios.create({
              withCredentials: true,
              jar: cookieJar
          }));
          await logIn(details,session)
            .then(res1=>{
                cookieJar.getCookies(details.domain, (err, cookies) => {
                      cookies="PVUE=ENG; "+cookies[0].key+"="+cookies[0].value + "; " + cookies[2].key + "="+cookies[2].value+";";
                      console.log("fuck me sideways")
                      console.log(cookies)
                    res(cookies);
                  });
            })
            .catch(rej1=>{
                if (rej1.message.includes("key")){res(details.cookies)}else{
                    if(rej1.message.includes("hung up")||rej1.message.includes("ENOTFOUND")){rej(new Error("Network Error: Try Again Shortly"))}else{
                rej(rej1)}}})
    
    }).then(res1=>{res.json({status:true,cookies:res1,encrpytedPassword:CryptoJS.AES.encrypt(details.credentials.password, encryptionKey).toString()});}).catch(error=>{
        res.status(200).json({status:false,message:error.message})})


}catch(error){res.json({status:false,message:error.message})}})


//the KEY to maintaing decent workability is when u refresh the auth cookies, try to just reauthenticate the same session rather than spawning new cookies. should prob replace them while true loops in client with like a 3 count, and tell it to regen cookies after 3 consecutive failures



app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
