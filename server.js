const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const redis = require('redis');

// Create an Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with proper CORS handling
const io = new Server(server, {
    cors: {
        origin: "*", // Adjust this for specific domains if needed, e.g., ["https://tesla.dicema.com"]
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"],
        credentials: true
    }
});

// Create a Redis client and connect to the Redis server
const redisClient = redis.createClient({
    host: '127.0.0.1', // Redis server host (default is localhost)
    port: 6379,        // Redis server port (default is 6379)
});

// Handle Redis connection errors
redisClient.on('error', (err) => {
    console.error('Redis error:', err);
});

// Initialize the counter variable
let counter = 0;

// Function to gracefully shut down the server
const gracefulShutdown = async () => {
    console.log('Shutting down gracefully...');

    // Close the Redis client
    try {
        await redisClient.quit();
        console.log('Redis client closed.');
    } catch (err) {
        console.error('Error closing Redis client:', err);
    }

    // Close the HTTP server
    server.close((err) => {
        if (err) {
            console.error('Error closing server:', err);
            process.exit(1); // Exit with failure
        } else {
            console.log('Server closed.');
            process.exit(0); // Exit successfully
        }
    });

    // Force close the server after 5 seconds if it hasn't closed yet
    setTimeout(() => {
        console.error('Forcing server shutdown...');
        process.exit(1); // Exit with failure
    }, 5000);
};

// Handle process signals for graceful shutdown
process.on('SIGINT', gracefulShutdown); // Ctrl+C
process.on('SIGTERM', gracefulShutdown); // Termination signal

const syncCounterToRedis = async (counter) => {
    try {
        // Attempt to set the counter value in Redis
        await redisClient.set('counter', counter);

    } catch (err) {
        console.error('Error syncing counter to Redis:', err);

        // Retry logic with a delay
        setTimeout(async () => {
            try {
                await redisClient.set('counter', counter);
                console.log('Counter successfully retried and synced to Redis:', counter);
            } catch (retryErr) {
                console.error('Retry failed for syncing counter to Redis:', retryErr);
            }
        }, 5000); // Retry after 5 seconds
    }
};

// Connect to Redis and start the server
redisClient.connect().then(() => {
    console.log('Connected to Redis');

    // Load the counter value from Redis when the server starts
    return redisClient.get('counter');
}).then((reply) => {
    counter = parseInt(reply) || 0; // Set the counter to the value from Redis (or 0 if it doesn't exist)
    console.log('Counter loaded from Redis:', counter);

    // Serve the HTML page
    app.get('/', (req, res) => {
        res.sendFile(__dirname + '/index.html');
    });

    // Socket.IO connection handler
    io.on('connection', async (socket) => {
        console.log('A user connected');

        // Send the current counter value to the newly connected client
        socket.emit('updateCounter', counter);
        // Send the total in visitors count to the newly connected client
        try {
            const totalVisitors = await redisClient.get('total_visitors') || 0;
            socket.emit('updateTotalVisitors', totalVisitors);
        } catch (err) {
            console.error('Error fetching total visitors count:', err);
        }
        // Handle increment events
        socket.on('increment', async () => {
            counter++;
            await syncCounterToRedis(counter); // Sync the new counter value to Redis

            // Increment the total visitors count in Redis
            try {
                await redisClient.incr('total_visitors');
                const totalVisitors = await redisClient.get('total_visitors');
                io.emit('updateTotalVisitors', totalVisitors); // Broadcast the total visitors count
            } catch (err) {
                console.error('Error updating total visitors count:', err);
            }

            io.emit('updateCounter', counter); // Broadcast the updated counter to all clients
        });

        // Handle decrement events
        socket.on('decrement', async () => {
            counter--;
            await syncCounterToRedis(counter); // Sync the new counter value to Redis
            io.emit('updateCounter', counter); // Broadcast the updated counter to all clients
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log('A user disconnected');
        });
    });
    app.use('/tesla-counter', express.static('public'));

    app.use('/tesla-counter', express.static('public'));

    // Start the server
    const PORT = 5492;
    server.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });

}).catch((err) => {
    console.error('Failed to connect to Redis:', err);
    process.exit(1); // Exit with failure
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    gracefulShutdown();
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    gracefulShutdown();
});
