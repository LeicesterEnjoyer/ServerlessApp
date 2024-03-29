const { app } = require('@azure/functions')
const sql = require('mssql')
const config = require('../database/config.js')


async function streamToString(readableStream) {
    const chunks = []
    for await (const chunk of readableStream) 
        chunks.push(chunk)

    return Buffer.concat(chunks).toString('utf-8')
}

app.http('CreateMovie', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Processing request to create a new movie...`)

        try {
            const requestBody = await streamToString(request.body)
            const movieData = JSON.parse(requestBody)

            if (!movieData)
                return { status: 400, body: "Request body is required." }

            const { title, year, genre, description, director, actors } = movieData
            if (!title || !year || !genre || !description || !director || !actors)
                return { status: 400, body: "Please provide all required fields: title, year, genre, description, director, actors." }

            await sql.connect(config)
            
            const sqlRequest = new sql.Request()
            sqlRequest.input('title', sql.VarChar(100), title)
            sqlRequest.input('year', sql.Int, year)
            sqlRequest.input('genre', sql.VarChar(50), genre)
            sqlRequest.input('description', sql.Text, description)
            sqlRequest.input('director', sql.VarChar(50), director)
            sqlRequest.input('actors', sql.Text, actors)
            await sqlRequest.query('INSERT INTO Movies (title, year, genre, description, director, actors) VALUES (@title, @year, @genre, @description, @director, @actors)')

            await sql.close()
            return { status: 201, body: "Movie record created successfully." }
        } catch (error) {
            console.log('Error creating movie record:', error)
            return { status: 500, body: `Error creating movie record: ${error.message}` }
        }
    }
})