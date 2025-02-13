const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const redis = require('redis');

// Create an Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server);

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
    io.on('connection', (socket) => {
        console.log('A user connected');

        // Send the current counter value to the newly connected client
        socket.emit('updateCounter', counter);

        // Handle increment events
        socket.on('increment', () => {
            counter++;
            redisClient.set('counter', counter); // Save the new counter value to Redis
            io.emit('updateCounter', counter); // Broadcast the updated counter to all clients
        });

        // Handle decrement events
        socket.on('decrement', () => {
            counter--;
            redisClient.set('counter', counter); // Save the new counter value to Redis
            io.emit('updateCounter', counter); // Broadcast the updated counter to all clients
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log('A user disconnected');
        });
    });

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