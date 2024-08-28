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
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
    optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());


// Verify Token Middleware
const verifyToken = async (req, res, next) => {
    const token = req.cookies?.token
    console.log('token==>', token)
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
        })
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
                console.log('Logout successful')
            } catch (err) {
                res.status(500).send(err)
            }
        })
        /* +++JWT Related API END */

        /* +++Users Related API START */
        // Save or update a user data in the database
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const { role, status, transactionId } = req.body;
            const query = { email: email };

            const options = { upsert: true };
            const updateUser = {
                $set: {
                    role: role || "bronze", // Default to "bronze" if no role is provided
                    status: status || "unpaid", // Default to "unpaid" if no status is provided
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

        // get all users data
        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })


        // get user by email
        app.get('/user/:email', async (req, res) => {
            const email = req.params.email
            const result = await usersCollection.findOne({ email })
            res.send(result)
        })


        /* +++Users Related API END */

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