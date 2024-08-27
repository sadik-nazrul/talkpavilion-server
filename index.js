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


// // Verify Token Middleware
// const verifyToken = async (req, res, next) => {
//     const token = req.cookies?.token
//     console.log(token)
//     if (!token) {
//         return res.status(401).send({ message: 'unauthorized access' })
//     }
//     jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
//         if (err) {
//             console.log(err)
//             return res.status(401).send({ message: 'unauthorized access' })
//         }
//         req.user = decoded
//         next()
//     })
// }



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
        // app.post('/jwt', async (req, res) => {
        //     const user = req.body
        //     const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        //         expiresIn: '365d',
        //     })
        //     res
        //         .cookie('token', token, {
        //             httpOnly: true,
        //             secure: process.env.NODE_ENV === 'production',
        //             sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        //         })
        //         .send({ success: true })
        // })
        // // Logout
        // app.get('/logout', async (req, res) => {
        //     try {
        //         res
        //             .clearCookie('token', {
        //                 maxAge: 0,
        //                 secure: process.env.NODE_ENV === 'production',
        //                 sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        //             })
        //             .send({ success: true })
        //         console.log('Logout successful')
        //     } catch (err) {
        //         res.status(500).send(err)
        //     }
        // })
        /* +++JWT Related API END */

        /* +++Users Related API START */
        // Save a user data in database
        // app.put('/user', async (req, res) => {
        //     const user = req.body
        //     const query = { email: user?.email }
        //     // Check user have on database or not
        //     const isExist = await usersCollection.findOne(query)
        //     if (isExist) return res.send(isExist)

        //     const options = { upsert: true }
        //     const updateUser = {
        //         $set: {
        //             ...user,
        //             userSaveTime: Date.now()
        //         }
        //     }
        //     const result = await usersCollection.updateOne(query, updateUser, options)
        //     res.send(result)
        // })

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

        // Update user role and status after payment
        app.patch('/user/update-payment', async (req, res) => {
            const { email, transactionId } = req.body;

            // Validate input
            if (!email || !transactionId) {
                return res.status(400).send({ error: 'Email and transaction ID are required' });
            }

            // Define the query and update
            const query = { email };
            const update = {
                $set: {
                    role: "gold",
                    status: "paid",
                    transactionId,
                },
            };

            try {
                const result = await usersCollection.updateOne(query, update);
                if (result.matchedCount === 0) {
                    return res.status(404).send({ error: 'User not found' });
                }
                res.send({ message: 'User updated successfully' });
            } catch (error) {
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });




        // get all users data
        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })
        /* +++Users Related API END */

        /* +++Stipe Payment related API STARD */

        // Payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;

            if (typeof price !== 'number' || isNaN(price)) {
                return res.status(400).send({ error: 'Invalid price value' });
            }

            const amount = Math.round(price * 100); // Convert dollars to cents

            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amount,
                    currency: "usd",
                    automatic_payment_methods: {
                        enabled: true,
                    },
                });

                res.send({
                    clientSecret: paymentIntent.client_secret,
                });
            } catch (error) {
                console.error('Error creating payment intent:', error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
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