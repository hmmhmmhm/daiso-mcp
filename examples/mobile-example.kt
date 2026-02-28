import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

// Daiso MCP API 클라이언트 예시 (Android/Kotlin)

class DaisoMCPClient(private val baseURL: String = "https://your-worker.workers.dev") {
    private val client = OkHttpClient()
    private val mediaType = "application/json; charset=utf-8".toMediaType()

    // 제품 검색
    fun searchProducts(
        query: String,
        category: String? = null,
        maxPrice: Int? = null,
        callback: (Result<String>) -> Unit
    ) {
        val arguments = JSONObject().apply {
            put("query", query)
            category?.let { put("category", it) }
            maxPrice?.let { put("maxPrice", it) }
        }

        executeTool("search_products", arguments, callback)
    }

    // 매장 찾기
    fun findStores(
        latitude: Double,
        longitude: Double,
        radius: Double = 5.0,
        limit: Int = 10,
        callback: (Result<String>) -> Unit
    ) {
        val arguments = JSONObject().apply {
            put("latitude", latitude)
            put("longitude", longitude)
            put("radius", radius)
            put("limit", limit)
        }

        executeTool("find_stores", arguments, callback)
    }

    // 재고 확인
    fun checkInventory(
        storeId: String,
        productId: String,
        callback: (Result<String>) -> Unit
    ) {
        val arguments = JSONObject().apply {
            put("storeId", storeId)
            put("productId", productId)
        }

        executeTool("check_inventory", arguments, callback)
    }

    // 가격 정보 조회
    fun getPriceInfo(
        productId: String,
        callback: (Result<String>) -> Unit
    ) {
        val arguments = JSONObject().apply {
            put("productId", productId)
        }

        executeTool("get_price_info", arguments, callback)
    }

    // Private: 도구 실행
    private fun executeTool(
        name: String,
        arguments: JSONObject,
        callback: (Result<String>) -> Unit
    ) {
        val json = JSONObject().apply {
            put("name", name)
            put("arguments", arguments)
        }

        val requestBody = json.toString().toRequestBody(mediaType)
        val request = Request.Builder()
            .url("$baseURL/execute")
            .post(requestBody)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                callback(Result.failure(e))
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    if (!it.isSuccessful) {
                        callback(Result.failure(IOException("Unexpected code $response")))
                        return
                    }

                    val body = it.body?.string()
                    if (body != null) {
                        callback(Result.success(body))
                    } else {
                        callback(Result.failure(IOException("Empty response body")))
                    }
                }
            }
        })
    }
}

// 사용 예시
fun main() {
    val client = DaisoMCPClient("https://your-worker.workers.dev")

    // 제품 검색
    client.searchProducts(query = "수납박스") { result ->
        result.onSuccess { response ->
            println("검색 결과: $response")
        }.onFailure { error ->
            println("에러: ${error.message}")
        }
    }

    // 매장 찾기
    client.findStores(
        latitude = 37.5665,
        longitude = 126.9780,
        radius = 5.0
    ) { result ->
        result.onSuccess { response ->
            println("매장 목록: $response")
        }.onFailure { error ->
            println("에러: ${error.message}")
        }
    }

    // 재고 확인
    client.checkInventory(
        storeId = "S001",
        productId = "P001"
    ) { result ->
        result.onSuccess { response ->
            println("재고 정보: $response")
        }.onFailure { error ->
            println("에러: ${error.message}")
        }
    }

    // 가격 정보 조회
    client.getPriceInfo(productId = "P002") { result ->
        result.onSuccess { response ->
            println("가격 정보: $response")
        }.onFailure { error ->
            println("에러: ${error.message}")
        }
    }
}
