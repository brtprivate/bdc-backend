# BDC MLM Backend API Documentation

## Overview
This API provides comprehensive 21-level MLM referral system analytics and management for the BDC platform.

## Base URL
```
http://localhost:5000/api
```

## Main Endpoint: User Level Analytics

### GET `/levels/user/:walletAddress`
**The primary endpoint for comprehensive 21-level referral network analytics.**

#### Parameters
- `walletAddress` (required): User's wallet address (0x format)
- `page` (optional): Page number for user details pagination (default: 1)
- `limit` (optional): Users per page (default: 50)
- `details` (optional): Include detailed user information (`true`/`false`, default: `false`)

#### Example Request
```bash
GET /api/levels/user/0x1922C8333021F85326c14EC667C06E893C0CFf07?details=true&page=1&limit=20
```

#### Response Structure
```json
{
  "userAddress": "0x1922c8333021f85326c14ec667c06e893c0cff07",
  "userInfo": {
    "registrationTime": "2024-01-15T10:30:00.000Z",
    "status": "active",
    "personalInvestment": 1500.50,
    "personalDeposits": 1500.50,
    "depositCount": 3,
    "investmentCount": 3,
    "lastInvestmentDate": "2024-01-20T15:45:00.000Z"
  },
  "teamSummary": {
    "totalTeamSize": 156,
    "totalTeamInvestment": 45230.75,
    "totalTeamEarnings": 4523.08,
    "activeLevels": 12,
    "maxLevel": 15,
    "performanceMetrics": {
      "roi": 10.0,
      "averageInvestmentPerUser": 290.07,
      "averageEarningsPerUser": 29.01,
      "levelDistributionEfficiency": 57.14,
      "topPerformingLevel": 3
    }
  },
  "levelAnalytics": [
    {
      "level": 1,
      "statistics": {
        "totalUsers": 25,
        "totalInvestment": 12500.00,
        "totalEarnings": 1250.00,
        "averageInvestment": 500.00,
        "averageEarnings": 50.00,
        "investmentPercentage": 27.63,
        "earningsPercentage": 27.63
      },
      "users": [
        {
          "userAddress": "0x...",
          "registrationTime": "2024-01-16T09:15:00.000Z",
          "levelInvestment": 500.00,
          "levelEarnings": 50.00,
          "personalTotalInvestment": 500.00,
          "personalInvestmentCount": 1,
          "lastInvestmentDate": "2024-01-16T09:15:00.000Z",
          "depositCount": 1,
          "status": "active",
          "isActive": true
        }
      ],
      "pagination": {
        "currentPage": 1,
        "totalUsers": 25,
        "usersPerPage": 20,
        "totalPages": 2,
        "hasNextPage": true,
        "hasPrevPage": false
      }
    }
  ],
  "metadata": {
    "includeUserDetails": true,
    "pagination": {
      "currentPage": 1,
      "usersPerPage": 20
    },
    "dataFreshness": "2024-01-21T12:00:00.000Z",
    "totalLevels": 21,
    "queryExecutionTime": 245
  }
}
```

#### Key Features
- **Complete 21-level breakdown**: Statistics for all levels (1-21)
- **Performance metrics**: ROI, efficiency, distribution analysis
- **Pagination support**: Handle large datasets efficiently
- **User details**: Individual user statistics when requested
- **Real-time data**: Fresh data with timestamps
- **Error handling**: Graceful handling of invalid addresses

## Quick Summary Endpoint

### GET `/levels/user/:walletAddress/summary`
**Optimized endpoint for dashboard widgets and quick overviews.**

#### Response Structure
```json
{
  "userAddress": "0x...",
  "quickStats": {
    "personalInvestment": 1500.50,
    "personalDeposits": 1500.50,
    "totalTeamSize": 156,
    "totalTeamInvestment": 45230.75,
    "totalTeamEarnings": 4523.08,
    "activeLevels": 12,
    "maxLevel": 15,
    "roi": 10.0
  },
  "levelSummary": [
    {
      "level": 1,
      "userCount": 25,
      "totalInvestment": 12500.00,
      "totalEarnings": 1250.00,
      "averageInvestment": 500.00
    }
  ],
  "timestamp": "2024-01-21T12:00:00.000Z"
}
```

## Additional Endpoints

### Level Statistics
- `GET /api/levels/stats/:level` - Statistics for specific level (1-21)
- `GET /api/levels/stats/all` - Statistics for all levels
- `GET /api/levels/summary` - Overall level summary

### User Management
- `GET /api/users/:walletAddress` - User details and statistics
- `GET /api/users` - All users with pagination
- `GET /api/users/:walletAddress/referrals` - Direct referrals
- `GET /api/users/:walletAddress/investments` - Investment history
- `POST /api/users` - Create/register new user

### Referral Network
- `GET /api/referrals/tree/:walletAddress` - Complete referral tree
- `GET /api/referrals/upline/:walletAddress` - Upline chain
- `GET /api/referrals/stats/:walletAddress` - Referral statistics
- `GET /api/referrals/top-referrers` - Top performing referrers

### Income Analytics
- `GET /api/income/user/:walletAddress` - User income breakdown
- `GET /api/income/level/:level` - Level income statistics
- `GET /api/income/overview` - Platform income overview
- `GET /api/income/trends` - Income trends analysis

### Platform Analytics
- `GET /api/analytics/platform` - Comprehensive platform metrics
- `GET /api/analytics/levels/performance` - Level performance analysis
- `GET /api/analytics/engagement` - User engagement metrics

### Contract Integration
- `GET /api/contract/info` - Contract information
- `GET /api/contract/events/:walletAddress` - Contract events for user
- `GET /api/contract/stats` - Contract statistics
- `POST /api/contract/sync/user/:walletAddress` - Sync user data

## Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid wallet address format"
}
```

### 404 Not Found
```json
{
  "error": "User not found",
  "walletAddress": "0x..."
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "Detailed error message",
  "timestamp": "2024-01-21T12:00:00.000Z"
}
```

## Frontend Integration Examples

### React Component Usage
```javascript
// Fetch comprehensive user analytics
const fetchUserAnalytics = async (walletAddress) => {
  try {
    const response = await fetch(
      `/api/levels/user/${walletAddress}?details=true&limit=10`
    );
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error);
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching user analytics:', error);
    throw error;
  }
};

// Fetch quick summary for dashboard
const fetchQuickSummary = async (walletAddress) => {
  const response = await fetch(`/api/levels/user/${walletAddress}/summary`);
  return response.json();
};
```

### Data Processing for Charts
```javascript
// Process level data for charts
const processLevelData = (levelAnalytics) => {
  return levelAnalytics.map(level => ({
    level: level.level,
    users: level.statistics.totalUsers,
    investment: level.statistics.totalInvestment,
    earnings: level.statistics.totalEarnings,
    roi: level.statistics.totalInvestment > 0 ? 
      (level.statistics.totalEarnings / level.statistics.totalInvestment * 100) : 0
  }));
};
```

## Performance Considerations

1. **Pagination**: Use pagination for large datasets
2. **Caching**: Implement frontend caching for frequently accessed data
3. **Selective Loading**: Use `details=false` for overview pages
4. **Batch Requests**: Use comparison endpoints for multiple users
5. **Real-time Updates**: Consider WebSocket integration for live updates

## Rate Limiting
- 100 requests per 15 minutes per IP
- Adjust limits in environment variables

## Authentication
Currently, the API is open. For production, implement:
- JWT token authentication
- Role-based access control
- API key management
