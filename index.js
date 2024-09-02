const express = require('express');
const cors = require('cors');
require("dotenv").config();
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRETE_KEY);



const app = express();
const port = process.env.PORT || 8000

// middleware
const corsOptions = {
    origin: ["http://localhost:5173", "https://talkpavilion-94167.firebaseapp.com", "https://talkpavilion-94167.web.app"],
    credentials: true,
    optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());


// Verify Token Middleware
const verifyToken = async (req, res, next) => {
    const token = req.cookies?.token
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    jwt.verify(token, process.env.API_SECRET_TOKEN, (err, decoded) => {
        if (err) {
            console.log(err)
            return res.status(401).send({ message: 'unauthorized access' })
        }
        req.user = decoded
        next()
    })
}



app.get('/', (req, res) => {
    res.send("Hello World! I am TalkPavilion Your ChitChat Freind")
});




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nymxsdl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {

    try {
        const usersCollection = client.db('talkpavilion').collection('users')
        const blogsCollection = client.db('talkpavilion').collection('blogs')
        const anouncementsCollection = client.db('talkpavilion').collection('anouncements')
        const commentsCollection = client.db('talkpavilion').collection('comments')

        /* +++MidleWares START+++ */
        // Post Limit Middleware
        const postLimit = async (req, res, next) => {
            const authorEmail = req.body.authorEmail;
            const userEmail = req.body.userEmail
            const limit = 5;


            if (!authorEmail) {
                return res.status(400).send({ message: 'Author email is required.' });
            }
            try {
                const user = await usersCollection.findOne({ email: userEmail })
                if (user && user?.role === 'gold' || user && user?.role === 'admin') {
                    return next()
                }
                const postCount = await blogsCollection.countDocuments({
                    authorEmail: authorEmail
                })
                if (postCount < limit) {
                    return next()
                }
                else {
                    return res.status(426).send('you react your post limit')
                }
            }
            catch (err) {
                console.log(err.message);
                return res.status(500).send({ message: "Internal Server Error" })
            }
        }
        // Verify admin Middleware
        const verifyAdmin = async (req, res, next) => {
            const adminEmail = req.user.email
            if (!adminEmail) {
                return res.status(400).send({ message: 'Author email is required.' });
            }
            try {
                const admin = await usersCollection.findOne({ email: adminEmail })
                if (admin && admin?.role === 'admin') {
                    return next()
                }
                else {
                    return res.status(401).send({ message: 'Unauthorized Access' })
                }
            }
            catch (err) {
                return res.status(500).send({ message: "Internal Server Error" })
            }
        }

        /* +++MidleWares END+++ */

        /* +++JWT Related API START */
        // auth related api
        app.post('/jwt', async (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.API_SECRET_TOKEN, {
                expiresIn: '365d',
            })
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true })
        });
        // Logout
        app.get('/logout', async (req, res) => {
            try {
                res
                    .clearCookie('token', {
                        maxAge: 0,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                    })
                    .send({ success: true })
            } catch (err) {
                res.status(500).send(err)
            }
        });
        /* +++JWT Related API END */


        /* +++Users Related API START */
        // Save or update a user data in the database
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const { name, role, status, transactionId } = req.body;
            console.log(name);

            const query = { email: email };

            const options = { upsert: true };
            const updateUser = {
                $set: {
                    name: name,
                    role: role || "bronze",
                    status: status || "unpaid",
                    transactionId: transactionId || null,
                    userSaveTime: Date.now()
                }
            };

            try {
                const result = await usersCollection.updateOne(query, updateUser, options);
                res.send(result);
            } catch (error) {
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });

        // Make admin
        app.put('/make-admin/:email', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const { role } = req.body;
            const query = { email: email };
            const options = { upsert: true };
            const updateUser = {
                $set: {
                    role: role
                }
            };

            const result = await usersCollection.updateOne(query, updateUser, options);
            res.send(result);

        });
        // get all users data
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        });
        // get user by email
        app.get('/user/:email', async (req, res) => {
            const email = req.params.email
            const result = await usersCollection.findOne({ email })
            res.send(result)
        });
        /* +++Users Related API END */

        /* +++Announcement Related API START */
        // Add Announcement
        app.post('/announce', verifyToken, verifyAdmin, async (req, res) => {
            const announce = req.body
            const result = await anouncementsCollection.insertOne(announce)
            res.send(result)
        });
        // Get all announcements
        app.get('/announcements', async (req, res) => {
            const result = await anouncementsCollection.find().toArray();
            res.send(result);
        });
        // Delete Announcement
        app.delete('/announcement/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await anouncementsCollection.deleteOne(query);
            res.send(result);
        })
        /* +++Announcement Related API END */


        /* +++Stipe Payment related API STARD */
        // Payment intent
        app.post("/create-payment-intent", async (req, res) => {
            const { price } = req.body;
            const totalPrice = Math.round(price * 100); // Convert dollars to cents

            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: totalPrice,
                currency: "usd",
                // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
                automatic_payment_methods: {
                    enabled: true,
                },
            });


            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });
        /* +++Stipe Payment related API END */


        /* +++Blog Related API START+++ */
        // Utility function for get blog data with comments
        const getBlogsWithComments = async (query = {}) => {
            const blogs = await blogsCollection.find(query).toArray();
            // Get all comments
            const comments = await commentsCollection.find().toArray();

            // Create a map of comments by postId
            const commentsMap = comments.reduce((acc, comment) => {
                if (!acc[comment.postId]) {
                    acc[comment.postId] = [];
                }
                acc[comment.postId].push(comment);
                return acc;
            }, {});

            // Add comments to each blog post and remove unwanted fields
            return blogs.map(blog => ({
                ...blog,
                authorEmail: undefined,
                authorPhoto: undefined,
                authorName: undefined,
                postDescription: undefined,
                tags: undefined,
                createdAt: undefined,
                comments: commentsMap[blog._id] || []
            }));
        };
        // get all blogs
        app.get('/blogs', async (req, res) => {
            const result = await getBlogsWithComments();
            res.send(result);
        });
        // Queried blogs
        app.get('/sortblogs', async (req, res) => {
            const sortOrder = -1;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 5;
            const skip = (page - 1) * limit;

            const blogs = await blogsCollection.aggregate([

                {
                    $addFields: {
                        voteDifferance: { $subtract: ['$upVote', '$downVote'] }
                    }
                },
                {
                    $sort: { voteDifferance: sortOrder }
                },
                {
                    $skip: skip
                },
                {
                    $limit: limit
                }
            ]).toArray();
            const totalBlogs = await blogsCollection.countDocuments();
            const totalPages = Math.ceil(totalBlogs / limit);
            res.send({ blogs, totalPages })
        });
        // Get single blog by ID
        app.get('/blog/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await blogsCollection.findOne(query);
            res.send(result);
        });
        // Get blogs by specific user
        app.get('/blogsuser', verifyToken, async (req, res) => {
            const email = req.query.email;
            const query = { authorEmail: email };
            const result = await getBlogsWithComments(query);
            res.send(result);

        });
        // Add Blog
        app.post('/add-blog', postLimit, async (req, res) => {
            const blog = req.body
            // Convert upVote and downVote to numbers
            blog.upVote = Number(blog.upVote);
            blog.downVote = Number(blog.downVote);
            const result = await blogsCollection.insertOne(blog)
            res.send(result)
        });
        // blog vote update
        app.put('/vote', verifyToken, async (req, res) => {
            const vote = req.body
            const blog = await blogsCollection.findOne({ _id: new ObjectId(vote?.id) })
            if (!blog) {
                return res.status(404).send('Blog not found');
            }
            const updateField = vote?.vote === 1 ? { $inc: { upVote: 1 } } : { $inc: { downVote: 1 } }


            const result = await blogsCollection.updateOne(
                { _id: new ObjectId(vote.id) },
                updateField
            )
            // console.log(result);

            res.send(result)
        });
        // Get all tags
        app.get('/tags', async (req, res) => {
            const tags = await blogsCollection.aggregate([
                { $unwind: '$tags' },
                { $group: { _id: null, uniqueTags: { $addToSet: '$tags' } } },
                { $project: { _id: 0, uniqueTags: 1 } }
            ]).toArray()

            const tagsArr = await (tags[0].uniqueTags)
            res.send(tagsArr)
        });
        // find blog by tag
        app.get('/blog', async (req, res) => {
            const { tag } = req.query;
            const query = { 'tags.value': tag }
            const result = await blogsCollection.find(query).toArray()
            res.send(result)
        });
        // Blog delete
        app.delete('/blogs/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await blogsCollection.deleteOne(query);
            res.send(result)
        })
        // comment post endpoint
        app.post('/comment', async (req, res) => {
            const comment = req.body;
            const result = await commentsCollection.insertOne(comment);
            res.send(result)
        });
        // update comment
        app.put('/comment/:id', async (req, res) => {
            const id = req.params.id;
            const { reply } = req.body
            const query = { _id: new ObjectId(id) }
            console.log(reply, ' this id:', query);
            const options = { upsert: true };
            const updateComment = {
                $set: {
                    reply: reply
                }
            }
            const result = await commentsCollection.updateOne(query, updateComment, options);
            res.send(result)

        })

        /* +++POST Related API END+++ */



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.log);



app.listen(port, () => {
    console.log(`TalkPavilion listening from port ${port}`);
})