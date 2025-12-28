const express = require("express")
const app =express()
app.use(express.json())

app.get("/",(req,res)=>{
    res.send("welcome akii")
})

app.get("/api/products",(req,res)=>{
    res.status(200).json({
        products:[
        { "id": 1, "name": "Laptop" },
        { "id": 2, "name": "Keyboard" },
        { "id": 3, "name": "Mouse" }
    ]
    })
})
app.post("/api/register",(req,res)=>{
    const {name,email,password}=req.body

    res.json({
        message: "User registered successfully",
        name,
        email,
        password
    })
})
app.get("/api/users/:id",(req,res)=>{
    const{id}=req.params

    res.json({
        message:`You requested user ${id}`
    })
})

app.listen(5000,()=>{
    console.log("server running on port 5000")
})