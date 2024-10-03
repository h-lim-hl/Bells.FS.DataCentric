const express = require('express');
const cors = require('cors');

require("dotenv").config();
const { MongoClient, ObjectId } = require('mongodb');
const MONGODB_URL = process.env.MONGODB_URL;
const dbname = 'blacksmith';

let app = express();
app.use(cors());

app.use(express.json());

async function connectMongoDb (url, dbName) {
  let client = await MongoClient.connect(url, {
    useUnifiedTopology : true
  });
  return client.db(dbName);
}

async function main() {
  //Connect to Data Cluster
   const db = await connectMongoDb(MONGODB_URL, dbname);
  app.get('/', (req, res) => {
    res.status(418).json({"message" : "I'm a teapot!"});
  });

  // Get all Materials or subset with query
  app.get('/materials', async (req, res) => {
    const collectionName = "materials";
    try{
      const { _id, name, density } = req.query;

      let query = {};
      if(_id) query["_id"] = new ObjectId(_id);
      if(name) query["name"]  = {$regex : name, $options: 'i'};
      if(density) query["density"] = density;
      
      let result;
      if(Object.keys(query).length < 1)
        result = await db.collection(collectionName).find().toArray();
      else {
        console.log(query);
        result = await db.collection(collectionName).find(query).toArray();
      }
        res.status(200).json({
        "result" : result
      });

      
    } catch (error){
      console.error(`Error in /materials: ${error.toString()}`);
      res.status(500).json({"error" : "Internal Server Error."});
    }
  });

  // Get all weapons or subset with query
  app.get('/weapons', async (req, res) => {
    const collectionName = "weapons";
    try{
      const { _id, name, materialName } = req.query;

      let query = {};
      if(_id) query["_id"] = new ObjectId(_id);
      if(name) query["name"]  = {$regex : name, $options: 'i'};
      if(materialName) query["material.name"] = {$regex: materialName, $options: 'i'};
      
      let result;
      if(Object.keys(query).length < 1)
        result = await db.collection(collectionName).find().toArray();
      else {
        console.log(query);
        result = await db.collection(collectionName).find(query).toArray();
      }
        res.status(200).json({
        "result" : result
      });

      
    } catch (error){
      console.error(`Error in /materials: ${error.toString()}`);
      res.status(500).json({"error" : "Internal Server Error."});
    }
  });

  // Post new weapon unto the weapons collection
  app.post('/weapon', async (req, res) => {
    const { name, material, description } = req.query;

    if(!(name && material && description)) {
        res.status(400).json({
          "error" : "Insufficent information for required operation."
        });
    }

    if(!(await db.collection("materials")))
      res.status(400).json({"error" : "weapon already exists!"});

    const materialDoc = await db.collection("materials")
      .findOne({ "name": {$regex:'^'+name, $options: 'i'} });

    if(!materialDoc)
      res.status(400).json({"error" : "material does not exist in database!"})

    const newWeapon = {
      "name" : name,
      "material" : {
          "_id" : material._id,
          "name" : material.name
      },
      "description" : description 
    };

    try {
    const result = await db.collection("weapons").insertOne(newWeapon)
    
    res.status(201).json({
      "message" : "New weapon added",
      "result" : result
    });
    } catch (error) {
      console.error(`post:weapon/ "${error.toString()}"`);
      res.status(500).json({
        "error" : "Internal Server Error"
      });
    }
  });
}
main();

const listenPort = 3000;
app.listen(listenPort, () => {
  console.log(`Server Started At ${listenPort}`);
});