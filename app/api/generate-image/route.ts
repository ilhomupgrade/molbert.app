import { type NextRequest, NextResponse } from "next/server"
import * as fal from "@fal-ai/serverless-client"

if (!process.env.FAL_KEY) {
  console.error("[v0] API: FAL_KEY environment variable is not set!")
}

fal.config({
  credentials: process.env.FAL_KEY,
})

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] API: Starting image generation request")
    console.log("[v0] API: FAL_KEY exists:", !!process.env.FAL_KEY)
    console.log("[v0] API: FAL_KEY length:", process.env.FAL_KEY?.length || 0)

    const formData = await request.formData()
    const mode = formData.get("mode") as string
    const prompt = formData.get("prompt") as string
    const aspectRatio = formData.get("aspectRatio") as string

    console.log("[v0] API: Mode:", mode)
    console.log("[v0] API: Prompt:", prompt)
    console.log("[v0] API: Aspect Ratio:", aspectRatio)

    if (!mode || !prompt) {
      console.log("[v0] API: Missing required fields")
      return NextResponse.json({ error: "Mode and prompt are required" }, { status: 400 })
    }

    if (!process.env.FAL_KEY) {
      console.error("[v0] API: FAL_KEY not configured")
      return NextResponse.json(
        {
          error: "API key not configured",
          details: "FAL_KEY environment variable is missing. Please add it in the Vars section.",
        },
        { status: 500 },
      )
    }

    const getAspectRatioString = (ratio: string): string => {
      switch (ratio) {
        case "portrait":
          return "9:16"
        case "landscape":
          return "16:9"
        case "wide":
          return "21:9"
        case "square":
        default:
          return "1:1"
      }
    }

    const aspectRatioString = getAspectRatioString(aspectRatio || "square")

    let result: any

    if (mode === "text-to-image") {
      console.log("[v0] API: Using text-to-image mode")
      console.log("[v0] API: Using aspect_ratio:", aspectRatioString)

      result = await fal.subscribe("fal-ai/nano-banana", {
        input: {
          prompt: prompt,
          num_images: 1,
          output_format: "png",
          aspect_ratio: aspectRatioString,
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") {
            update.logs?.map((log) => log.message).forEach(console.log)
          }
        },
      })
    } else if (mode === "image-editing") {
      console.log("[v0] API: Using image-editing mode")
      console.log("[v0] API: Using aspect_ratio:", aspectRatioString)

      const image1 = formData.get("image1") as File
      const image2 = formData.get("image2") as File
      const image1Url = formData.get("image1Url") as string
      const image2Url = formData.get("image2Url") as string

      const hasImage1 = image1 || image1Url
      const hasImage2 = image2 || image2Url

      if (!hasImage1) {
        console.log("[v0] API: Missing first image for editing mode")
        return NextResponse.json({ error: "At least one image is required for editing mode" }, { status: 400 })
      }

      console.log("[v0] API: Converting images to base64")

      const imageUrls: string[] = []

      if (image1) {
        const image1Buffer = await image1.arrayBuffer()
        const image1Base64 = `data:${image1.type};base64,${Buffer.from(image1Buffer).toString("base64")}`

        if (image1Base64.length > 1500000) {
          console.log(
            "[v0] API: WARNING - Image1 base64 is very large:",
            image1Base64.length,
            "bytes. This may cause issues.",
          )
        }

        imageUrls.push(image1Base64)
        console.log("[v0] API: Image1 base64 length:", image1Base64.length)
      } else if (image1Url) {
        imageUrls.push(image1Url)
        console.log("[v0] API: Using Image1 URL:", image1Url)
      }

      if (image2) {
        const image2Buffer = await image2.arrayBuffer()
        const image2Base64 = `data:${image2.type};base64,${Buffer.from(image2Buffer).toString("base64")}`

        if (image2Base64.length > 1500000) {
          console.log(
            "[v0] API: WARNING - Image2 base64 is very large:",
            image2Base64.length,
            "bytes. This may cause issues.",
          )
        }

        imageUrls.push(image2Base64)
        console.log("[v0] API: Image2 base64 length:", image2Base64.length)
      } else if (image2Url) {
        imageUrls.push(image2Url)
        console.log("[v0] API: Using Image2 URL:", image2Url)
      }

      console.log("[v0] API: Total images for editing:", imageUrls.length)

      let retries = 2
      let lastError: any = null

      while (retries >= 0) {
        try {
          result = await fal.subscribe("fal-ai/nano-banana/edit", {
            input: {
              prompt: prompt,
              image_urls: imageUrls,
              output_format: "png",
              aspect_ratio: aspectRatioString,
            },
            logs: true,
            onQueueUpdate: (update) => {
              if (update.status === "IN_PROGRESS") {
                update.logs?.map((log) => log.message).forEach(console.log)
              }
            },
          })
          break
        } catch (error) {
          lastError = error
          retries--
          if (retries >= 0) {
            console.log(`[v0] API: Request failed, retrying... (${retries} retries left)`)
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }
        }
      }

      if (retries < 0 && lastError) {
        throw lastError
      }
    } else {
      console.log("[v0] API: Invalid mode:", mode)
      return NextResponse.json({ error: "Invalid mode. Must be 'text-to-image' or 'image-editing'" }, { status: 400 })
    }

    console.log("[v0] API: Fal response received")
    console.log("[v0] API: Result data:", JSON.stringify(result.data, null, 2))

    if (!result.data || !result.data.images || result.data.images.length === 0) {
      console.log("[v0] API: No images in response")
      throw new Error("No images generated")
    }

    const imageUrl = result.data.images[0].url
    const description = result.data.description || ""

    console.log("[v0] API: Generated image URL:", imageUrl)
    console.log("[v0] API: AI Description:", description)

    return NextResponse.json({
      url: imageUrl,
      prompt: prompt,
      description: description,
    })
  } catch (error) {
    console.error("[v0] API: Error generating image:", error)

    let errorMessage = "Unknown error occurred"
    let errorDetails = ""

    if (error && typeof error === "object") {
      const err = error as any

      // Handle 401 authentication errors specifically
      if (err.status === 401) {
        console.error("[v0] API: Authentication error - invalid or missing API key")
        errorMessage = "Authentication failed"
        errorDetails = "Your FAL_KEY may be invalid or expired. Please check your API key in the Vars section."

        if (err.body?.detail) {
          errorDetails += ` Details: ${err.body.detail}`
        }
      } else if (err.message) {
        errorMessage = err.message
        errorDetails = err.body?.detail || err.body || String(error)
      } else {
        errorDetails = err.body?.detail || err.body || JSON.stringify(err)
      }
    } else if (error instanceof Error) {
      errorMessage = error.message
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: errorDetails,
      },
      { status: 500 },
    )
  }
}
