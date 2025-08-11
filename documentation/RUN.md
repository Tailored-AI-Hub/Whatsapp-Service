### How to run it on local?

Need to add this .env file

```jsx
   NODE_ENV=development
   PORT=3000
   USE_CLOUDWATCH=false
   SKIP_AUTH=true
   STORAGE_TYPE=s3
   CLOUDWATCH_GROUP_NAME=whatsapp-service/logs
	 TARGET_GROUP='your_particular_group_id'
   AWS_ACCESS_KEY_ID=
   AWS_SECRET_ACCESS_KEY=
   AWS_REGION=
   SQS_QUEUE_URL=
```

Then run the following command -

```jsx
   docker-compose up --build
```

Or without docker run these 2 commands - 

```jsx
npm install
node main.js
```

For localstack SQS implementation - 
Install localstack image - 

```jsx
docker run -d --name localstack -p 4566:4566 localstack/localstack
```

Create queue - 

```jsx
awslocal sqs create-queue --queue-name my-queue.fifo --attributes FifoQueue=true,ContentBasedDeduplication=true
```

Now add these in .env file - 

```jsx
AWS_ENDPOINT=http://localhost:4566
SQS_QUEUE_URL=http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/my-queue.fifo
```