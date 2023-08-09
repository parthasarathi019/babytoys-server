const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// verify jwt token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization.split(" ")[1];
  if (!token) {
    res.status(401).send({ error: "unauthorized user" });
    return;
  }
  const decoded = jwt.verify(token, process.env.SECRET_KEY);
  if (decoded) {
    req.decoded = decoded;
    next();
  } else {
    res.status(401).send({ error: "unauthorized user" });
  }
};

// mongodb
const uri = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0.by31wed.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri);

const run = async () => {
  try {
    const EduPlayMart = client.db("EduPlayMart");
    const BannerContents = EduPlayMart.collection("banner-contents");
    const Features = EduPlayMart.collection("features");
    const Toys = EduPlayMart.collection("toys");
    const HIWContents = EduPlayMart.collection("hiw-contents");
    const Gallery = EduPlayMart.collection("gallery");
    const Testimonials = EduPlayMart.collection("testimonials");
    const Blogs = EduPlayMart.collection("blogs");

    // get banner contents
    app.get("/api/banner-contents", async (req, res) => {
      try {
        const bannerContents = await BannerContents.find().toArray();
        res.send(bannerContents);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // get feature contents
    app.get("/api/features", async (req, res) => {
      try {
        const features = await Features.find().toArray();
        res.send(features);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // get all toys
    app.get("/api/toys", async (req, res) => {
      try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const sort = req.query.sort;
        const search = req.query.search || "";

        // create text index
        await Toys.createIndex({ name: "text" });
        let toys;
        switch (sort) {
          case "price-ascending": {
            toys = search
              ? await Toys.find({ $text: { $search: search } })
                  .sort({ price: 1 })
                  .skip(skip)
                  .limit(limit)
                  .toArray()
              : await Toys.find()
                  .sort({ price: 1 })
                  .skip(skip)
                  .limit(limit)
                  .toArray();
            break;
          }
          case "price-descending": {
            toys = search
              ? await Toys.find({ $text: { $search: search } })
                  .sort({ price: -1 })
                  .skip(skip)
                  .limit(limit)
                  .toArray()
              : await Toys.find()
                  .sort({ price: -1 })
                  .skip(skip)
                  .limit(limit)
                  .toArray();
            break;
          }
          default: {
            toys = search
              ? await Toys.find({ $text: { $search: search } })
                  .skip(skip)
                  .limit(limit)
                  .toArray()
              : await Toys.find().skip(skip).limit(limit).toArray();
          }
        }

        const total = search
          ? await Toys.countDocuments({ $text: { $search: search } })
          : await Toys.countDocuments();

        res.send({ toys, total });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // get toys by category
    app.get("/api/toys/category/:subCategory", async (req, res) => {
      try {
        const subCategory = req.params.subCategory;
        const toys = await Toys.find({ subCategory }).toArray();
        res.send(toys);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // get toy by id
    app.get("/api/toys/:id", async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const toy = await Toys.findOne({ _id });
        res.send(toy);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // get related toys by id
    app.get("/api/toys/related-toys/:id", async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const toy = await Toys.findOne({ _id });
        if (toy) {
          const relatedToys = await Toys.find({
            subCategory: toy.subCategory,
            _id: { $ne: toy._id },
          }).toArray();
          res.send(relatedToys);
        } else {
          res.status(404).send({ error: "No toys found!" });
        }
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // generate jwt access token
    app.post("/api/jwt", async (req, res) => {
      try {
        const token = jwt.sign(req.body, process.env.SECRET_KEY, {
          expiresIn: "2d",
        });
        res.send({ token: "Bearer " + token });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // get toys by seller jwt token
    app.get("/api/seller/toys", verifyToken, async (req, res) => {
      try {
        const { email } = req.decoded;
        const sort = req.query.sort;
        const result = Toys.find({ sellerEmail: email });
        const sortedResult =
          sort === "price-ascending"
            ? result.sort({ price: 1 })
            : sort === "price-descending"
            ? result.sort({ price: -1 })
            : result;
        const toys = await sortedResult.toArray();
        res.send(toys);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // add a toy
    app.post("/api/seller/toys", verifyToken, async (req, res) => {
      try {
        const { email } = req.decoded;
        if (email !== req.body.sellerEmail) {
          res.status(403).send({ error: "bad auth" });
          return;
        }
        const result = await Toys.insertOne(req.body);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // update a toy
    app.put("/api/seller/toys/:id", verifyToken, async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const { price, availableQty, details } = req.body;
        const result = await Toys.updateOne(
          { _id },
          { $set: { price, availableQty, details } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // delete a toy
    app.delete("/api/seller/toys/:id", verifyToken, async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const result = await Toys.deleteOne({ _id });
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // get how it works contents
    app.get("/api/hiw-contents", async (req, res) => {
      try {
        const contents = await HIWContents.find().toArray();
        res.send(contents);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // get gallery image
    app.get("/api/gallery", async (req, res) => {
      try {
        const gallery = await Gallery.find().toArray();
        res.send(gallery);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // get testimonials
    app.get("/api/testimonials", async (req, res) => {
      try {
        const testimonials = await Testimonials.find().toArray();
        res.send(testimonials);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // get all blogs
    app.get("/api/blogs", async (req, res) => {
      try {
        const blogs = await Blogs.find().toArray();
        res.send(blogs);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // get blog by id
    app.get("/api/blogs/:id", async (req, res) => {
      try {
        const _id = new ObjectId(req.params.id);
        const blog = await Blogs.findOne({ _id });
        res.send(blog);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.log(error);
  }
};

run();

// home route
app.get("/", (req, res) => {
  res.send(
    "<h1 style='text-align: center;'>Welcome to EduPlayMart Server</h1>"
  );
});

app.listen(port, () => {
  console.log(`Server is running at port ${port}`);
});
