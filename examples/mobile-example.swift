import Foundation

// Daiso MCP API 클라이언트 예시 (iOS/Swift)

class DaisoMCPClient {
    let baseURL: String

    init(baseURL: String = "https://your-worker.workers.dev") {
        self.baseURL = baseURL
    }

    // 제품 검색
    func searchProducts(query: String, category: String? = nil, maxPrice: Int? = nil, completion: @escaping (Result<SearchResult, Error>) -> Void) {
        var arguments: [String: Any] = ["query": query]
        if let category = category {
            arguments["category"] = category
        }
        if let maxPrice = maxPrice {
            arguments["maxPrice"] = maxPrice
        }

        executeTool(name: "search_products", arguments: arguments) { result in
            switch result {
            case .success(let data):
                do {
                    let searchResult = try JSONDecoder().decode(SearchResult.self, from: data)
                    completion(.success(searchResult))
                } catch {
                    completion(.failure(error))
                }
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }

    // 매장 찾기
    func findStores(latitude: Double, longitude: Double, radius: Double = 5.0, limit: Int = 10, completion: @escaping (Result<StoreResult, Error>) -> Void) {
        let arguments: [String: Any] = [
            "latitude": latitude,
            "longitude": longitude,
            "radius": radius,
            "limit": limit
        ]

        executeTool(name: "find_stores", arguments: arguments) { result in
            switch result {
            case .success(let data):
                do {
                    let storeResult = try JSONDecoder().decode(StoreResult.self, from: data)
                    completion(.success(storeResult))
                } catch {
                    completion(.failure(error))
                }
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }

    // 재고 확인
    func checkInventory(storeId: String, productId: String, completion: @escaping (Result<InventoryResult, Error>) -> Void) {
        let arguments: [String: Any] = [
            "storeId": storeId,
            "productId": productId
        ]

        executeTool(name: "check_inventory", arguments: arguments) { result in
            switch result {
            case .success(let data):
                do {
                    let inventoryResult = try JSONDecoder().decode(InventoryResult.self, from: data)
                    completion(.success(inventoryResult))
                } catch {
                    completion(.failure(error))
                }
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }

    // 가격 정보 조회
    func getPriceInfo(productId: String, completion: @escaping (Result<PriceInfo, Error>) -> Void) {
        let arguments: [String: Any] = ["productId": productId]

        executeTool(name: "get_price_info", arguments: arguments) { result in
            switch result {
            case .success(let data):
                do {
                    let priceInfo = try JSONDecoder().decode(PriceInfo.self, from: data)
                    completion(.success(priceInfo))
                } catch {
                    completion(.failure(error))
                }
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }

    // Private: 도구 실행
    private func executeTool(name: String, arguments: [String: Any], completion: @escaping (Result<Data, Error>) -> Void) {
        let url = URL(string: "\(baseURL)/execute")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "name": name,
            "arguments": arguments
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            completion(.failure(error))
            return
        }

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }

            guard let data = data else {
                completion(.failure(NSError(domain: "DaisoMCP", code: -1, userInfo: [NSLocalizedDescriptionKey: "No data received"])))
                return
            }

            completion(.success(data))
        }.resume()
    }
}

// 데이터 모델
struct SearchResult: Codable {
    let content: [ContentItem]
}

struct StoreResult: Codable {
    let content: [ContentItem]
}

struct InventoryResult: Codable {
    let content: [ContentItem]
}

struct PriceInfo: Codable {
    let content: [ContentItem]
}

struct ContentItem: Codable {
    let type: String
    let text: String
}

// 사용 예시
let client = DaisoMCPClient(baseURL: "https://your-worker.workers.dev")

// 제품 검색
client.searchProducts(query: "수납박스") { result in
    switch result {
    case .success(let searchResult):
        print("검색 결과: \(searchResult)")
    case .failure(let error):
        print("에러: \(error)")
    }
}

// 매장 찾기
client.findStores(latitude: 37.5665, longitude: 126.9780, radius: 5.0) { result in
    switch result {
    case .success(let storeResult):
        print("매장 목록: \(storeResult)")
    case .failure(let error):
        print("에러: \(error)")
    }
}
