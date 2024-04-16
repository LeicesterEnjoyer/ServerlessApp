const { app } = require('@azure/functions')
const sql = require('mssql')
const config = require('../database/config.js')
const cheerio = require('cheerio')


async function streamToString(readableStream) {
    const chunks = []
    for await (const chunk of readableStream) 
        chunks.push(chunk)

    return Buffer.concat(chunks).toString('utf-8')
}

async function searchImages(title) {
    const searchQuery = `${title} movie poster`
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=isch`

    const response = await fetch(searchUrl)
    const html = await response.text()
    const $ = cheerio.load(html)
    const images = []

    $('img').each((index, element) => {
        const imageUrl = $(element).attr('src')
        if (imageUrl && imageUrl.startsWith('http'))
            images.push(imageUrl)
    })

    return images.slice(0, 6)
}

async function searchSoundtrack(title) {
    const searchQuery = `${title} soundtrack`
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`
    
    const response = await fetch(searchUrl)
    const html = await response.text()
    const $ = cheerio.load(html)

    return $('a[href^="/url"]').first().attr('href').replace('/url?q=', '').split('&')[0]
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
            
            const soundtrack = await searchSoundtrack(title)
            const thumbnailImages = await searchImages(title)

            await sql.connect(config)
            
            let sqlRequest = new sql.Request()
            sqlRequest.input('title', sql.VarChar(100), title)
            sqlRequest.input('year', sql.Int, year)
            sqlRequest.input('genre', sql.VarChar(50), genre)
            sqlRequest.input('description', sql.Text, description)
            sqlRequest.input('director', sql.VarChar(50), director)
            sqlRequest.input('actors', sql.Text, actors)
            sqlRequest.input('soundtrack', sql.VarChar(255), soundtrack)
            await sqlRequest.query('INSERT INTO Movies (title, year, genre, description, director, actors, soundtrack) VALUES (@title, @year, @genre, @description, @director, @actors, @soundtrack)')

            const movieIdQuery = await sql.query`SELECT id FROM Movies WHERE title = ${title}`
            const movieId = movieIdQuery.recordset[0].id

            sqlRequest = new sql.Request()
            sqlRequest.input('movie_id', sql.Int, movieId)
            sqlRequest.input('thumbnail', sql.VarChar(255), thumbnailImages[0])
            await sqlRequest.query('INSERT INTO MovieGallery (movie_id, thumbnail) VALUES (@movie_id, @thumbnail)')
            
            const galleryIdQuery = await sql.query`SELECT id FROM MovieGallery WHERE movie_id = ${movieId}`
            const galleryId = galleryIdQuery.recordset[0].id

            for (let i = 0; i < thumbnailImages.length; i++) {
                sqlRequest = new sql.Request()
                sqlRequest.input('gallery_id', sql.Int, galleryId)
                sqlRequest.input('picture', sql.VarChar(255), thumbnailImages[i])
                await sqlRequest.query('INSERT INTO GalleryPicture (gallery_id, picture) VALUES (@gallery_id, @picture)')
            }

            await sql.close()
            return { status: 201, body: "Movie record created successfully." }
        } catch (error) {
            console.log('Error creating movie record:', error)
            return { status: 500, body: `Error creating movie record: ${error.message}` }
        }
    }
})