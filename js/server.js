const express = require("express");
const cors = require("cors");

require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");
const MONGODB_URL = process.env.MONGODB_URL;
const dbname = "blacksmith";
const weaponsCollection = "weapons";
const materialsCollection = "materials";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

function generateAccessToken(id, email) {
  let payload = {
    "user_id" : id,
    "email" : email
  }

    // create the JWT
    // jwt.sign()
    // - parameter 1: the payload (sometimes known as 'claims')
    // - parameter 2: token secret,
    // - parameter 3: options (to set expiresIn)
    let token = jwt.sign(payload, process.env.TOKEN_SECRET, {
      "expiresIn" : "1h" // h for hour, d for days,
                         // m is for minutes and
                         // s is for seconds
    });

    return token;
}

// middleware: a function that executes before a route function
function verifyToken(req, res, next) {
  //get the JET from the header
  let authHeader = req.headers["authorization"];
  let token = null;
  if(authHeader) {
    // token will be stored in the header as :
    // BEARER <JWT Token>
    token = authHeader.split(' ')[1];
    console.log(`11${token}`);
    if(token) {
      // the callback function in the third parameter will be called after
      // the token has been verified
      jwt.verify(token, process.env.TOKEN_SECRET, function(error, payload) {
        if(error) {
          console.error(`verifyToken: ${error.toString()}`);
          return res.sendStatus(403);
        }
        console.log("1");
        // save the payload into the request
        req.user = payload;

        // call the next middleware or the route function
        next();
      });
    } else { return res.sendStatus(403); }
  } else { return res.sendStatus(403); }
}


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
  app.get("/materials", async (req, res) => {
    try{
      const { _id, name, density } = req.query;

      let query = {};
      if(_id) query["_id"] = new ObjectId(_id);
      if(name) query["name"]  = {$regex : name, $options: 'i'};
      if(density) query["density"] = density;
      
      let result = await db.collection(materialsCollection).find(query).toArray();
      res.status(200).json({
        "result" : result
      });

      
    } catch (error){
      console.error(`Error in /materials: ${error.toString()}`);
      res.status(500).json({"error" : "Internal Server Error."});
    }
  });

  // Get all weapons or subset with query
  app.get("/weapons", async (req, res) => {
    try{
      const { _id, name, materialName } = req.query;

      let query = {};
      if(_id) query["_id"] = new ObjectId(_id);
      if(name) query["name"]  = {$regex : name, $options: 'i'};
      if(materialName) query["material.name"] = {$regex: materialName, $options: 'i'};
      
      let result = await db.collection(weaponsCollection).find(query).toArray();
      
      res.status(200).json({
        "result" : result
      });

      
    } catch (error){
      console.error(`Error in /materials: ${error.toString()}`);
      res.status(500).json({"error" : "Internal Server Error."});
    }
  });

  // get route for specific id
  // eg. route = <root>/weapons/<id>
  app.get("/weapons/:id", async (req, res) => {
    try {
      let query = { _id : new ObjectId(req.params.id) };

      let result = await db.collection(weaponsCollection).findOne(query);

      res.status(200).json({"result": result});
    } catch (error) {
      console.error(`"weapon/:id" route: ${error.ToString()}`);
      res.status(500).json("Internal Server Error!");
    }
  });

  // Post new weapon unto the weapons collection
  app.post("/weapons", verifyToken, async (req, res) => {
    const { name, material, description } = req.body;

    if(!( Boolean(name) &&
          Boolean(material) &&
          Boolean(description)
      ) ) {
        res.status(400).json({
          "error" : "Insufficent information for required operation."
        });
    }

    if(!(await db.collection("materials")))
      res.status(400).json({"error" : "weapon already exists!"});

    const materialDoc = await db.collection("materials")
      .findOne({ "name": {$regex:'^'+material.name, $options: 'i'} });

    console.log(materialDoc ? materialDoc.toString() : "materialDoc is null");
    if(!materialDoc)
      res.status(400).json({"error" : "material does not exist in database!"})

    const newWeapon = {
      "name" : name,
      "material" : {
          "_id" : materialDoc._id,
          "name" : materialDoc.name
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

  // route for user to sign up
  // the user must provide an email and password
  app.post("/users", async (req, res) => {
    const numHashes = 12;
    try {
      let { email, password } = req.body;
      if(!Boolean(email) || !Boolean(password)) {
        return res.status(400).json({
          "error" : "Insufficent information for required operation."
        });
      }

      let userDoc = {
        "email" : email,
        "password" : await bcrypt.hash(password, numHashes)
      };

      let result = await db.collection("users").insertOne(userDoc);

      res.status(201).json({
        "message" : "New user added",
        "result" : result
      });

    } catch (error) {
      console.error(`post users :- ${error.toString()}`);
      res.status(500).json({"error" : "Internal Server Error."});
    }
  });

  // user login
  app.post("/login", async (req, res) => {
    try{
      let { email, password } = req.body;
      if(!Boolean(email) || !Boolean(password)) {
        res.status(400).json({
          "error" : "Insufficent information for required operation."
        });
      }

      let user = await db.collection("users").findOne({
        "email" : email
      });

      if(Boolean(user)) {
        // check the password (compare plaintext with the hashed one in the database)
        if(bcrypt.compareSync(password, user.password)) {
          let accessToken = generateAccessToken(user._id, user.email);
          res.status(202).json({
            "accessToken" : accessToken
          });
          return;
        }
      }
      res.status(401).json({
        "error" : "Unauthorized"
      });
    } catch (error) {
      console.error(`post login := ${error.toString()}`);
      res.status(500).json({
        "error" : "Internal Server Error"
      });
    }
  });

  // Update
  app.put("/weapons/:id", verifyToken, async (req, res) => {
    try {
      let id = req.params.id;
    
      let { name, material, description } = req.body;

      if(!Boolean(name) || !Boolean(material) || !Boolean(description)) {
        return res.status(400).json({
          "error" : "Insufficent information for required operation."
        });
      }

      let materialDoc = await db.collection(materialsCollection).findOne({
        "name" : material.name
      });

      if(!Boolean(materialDoc)) {
        return res.status(400).json({
          "error" : "Material does not exist!"
        });
      }

      let updatedDoc = {
        "name" : name,
        "material" : {
          "_id" : new ObjectId(materialDoc._id),
          "name" : materialDoc.name
        },
        "description" : description
      }

      let result = db.collection(weaponsCollection).updateOne({
        "_id" : new ObjectId(id)
      }, {
        "$set" : updatedDoc
      });

      if(result.matchedCoumt == 0) {
        return res.status(404).json({
          "error" : `Weapon id{${id}} does not exist!`
        });
      }

      res.status(200).json({
        "message" : "Weapon updated"
      });

    } catch (error) {
      console.error(`put weapons/:id :- ${error}`);
      res.status(500).json({
        "error" : "Internal Server Error"
      });
    }
  });

  app.delete("/weapons/:id", verifyToken, async (req, res) => {
    try {
      let id = req.params.id;

      let result = await db.collection(weaponsCollection).deleteOne({
        "_id" : new ObjectId(id)
      });

      if(result.deletedCount == 0) {
        return res.status(404).json({
          "error" : `Weapon with id{${id}} not found`
        });
      }

      res.status(202).json({
        "message" : "Weapon deleted"
      });

    } catch (error) {
      console.error(`delete weapons/:id :- ${error}`);
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