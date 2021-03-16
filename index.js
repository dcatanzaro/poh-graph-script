const { request, gql } = require("graphql-request");
const mongoose = require("mongoose");
const express = require("express");
const schedule = require("node-schedule");

const app = express();
const port = 3333;

const DB_HOST = "localhost";
const DB_PORT = "27017";
const DB_USER = "";
const DB_PASS = "";
const DB_NAME = "pohstatistics";

const urlMongo = `mongodb://${DB_HOST}:${DB_PORT}/${DB_NAME}`;

mongoose.connect(urlMongo, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const TYPE_ALL = 0;
const TYPE_REGISTERED = 1;
const TYPE_VOUCHINGPHASE = 2;
const TYPE_PENDINGREGISTRATION = 3;
const TYPE_VOUCHED = 4;

const Statistics = mongoose.model(
    "statistics",
    new mongoose.Schema(
        {
            type: { type: Number },
            value: Number,
        },
        {
            timestamps: true,
        }
    )
);

const countAll = async (count = 0, skip = 0) => {
    const limit = 1000;

    const query = gql`
        {
            submissions(
                first: ${limit}
                skip: ${skip}
                orderBy: creationTime
                orderDirection: desc
            ) {
                id
            }
        }
    `;

    const result = await request(
        "https://api.thegraph.com/subgraphs/name/kleros/proof-of-humanity-mainnet",
        query
    );

    count += result.submissions.length;

    if (result.submissions.length >= limit) {
        return await countAll(count, skip + limit);
    } else {
        const counter = new Statistics({ type: TYPE_ALL, value: count });
        counter.save();

        return count;
    }
};

const countRegistered = async (count = 0, countVouchees = 0, skip = 0) => {
    const limit = 1000;

    const query = gql`
        {
            submissions(
                first: ${limit}
                skip: ${skip}
                orderBy: creationTime
                orderDirection: desc
                where: { registered: true },
            ) {
                id,
                vouchees {
                    id,
                    name
                },
            }
        }
    `;

    const result = await request(
        "https://api.thegraph.com/subgraphs/name/kleros/proof-of-humanity-mainnet",
        query
    );

    result.submissions.map((sub) => {
        countVouchees += sub.vouchees.length;
    });

    count += result.submissions.length;

    if (result.submissions.length >= limit) {
        return await countRegistered(count, countVouchees, skip + limit);
    } else {
        const counter = new Statistics({ type: TYPE_REGISTERED, value: count });
        counter.save();

        const counterVouched = new Statistics({
            type: TYPE_VOUCHED,
            value: countVouchees,
        });
        counterVouched.save();

        return count;
    }
};

const countVouchingPhase = async (count = 0, skip = 0) => {
    const limit = 1000;

    const query = gql`
        {
            submissions(
                first: ${limit}
                skip: ${skip}
                orderBy: creationTime
                orderDirection: desc
                where: { status: "Vouching" }
            ) {
                id
            }
        }
    `;

    const result = await request(
        "https://api.thegraph.com/subgraphs/name/kleros/proof-of-humanity-mainnet",
        query
    );

    count += result.submissions.length;

    if (result.submissions.length >= limit) {
        return await countVouchingPhase(count, skip + limit);
    } else {
        const counter = new Statistics({
            type: TYPE_VOUCHINGPHASE,
            value: count,
        });
        counter.save();

        return count;
    }
};

const countPendingRegistration = async (count = 0, skip = 0) => {
    const limit = 1000;

    const query = gql`
        {
            submissions(
                first: ${limit}
                skip: ${skip}
                orderBy: creationTime
                orderDirection: desc
                where: { status: "PendingRegistration" }
            ) {
                id
            }
        }
    `;

    const result = await request(
        "https://api.thegraph.com/subgraphs/name/kleros/proof-of-humanity-mainnet",
        query
    );

    count += result.submissions.length;

    if (result.submissions.length >= limit) {
        return await countPendingRegistration(count, skip + limit);
    } else {
        const counter = new Statistics({
            type: TYPE_PENDINGREGISTRATION,
            value: count,
        });
        counter.save();

        return count;
    }
};

schedule.scheduleJob("0 * * * *", () => {
    countAll();
    countRegistered();
    countVouchingPhase();
    countPendingRegistration();
});

(async () => {
    //console.log("All submissions | Count: " + (await countAll()));
    // console.log("Status Registered | Count: " + (await countRegistered()));
    // console.log(
    //     "Status Vouching Phase | Count: " + (await countVouchingPhase())
    // );
    // console.log(
    //     "Status Pending Registration | Count: " +
    //         (await countPendingRegistration())
    // );
})();

app.get("/api/statistics_hour", async (req, res) => {
    const all = Statistics.find({ type: TYPE_ALL }, { value: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .limit(24)
        .lean();
    const registered = Statistics.find(
        { type: TYPE_REGISTERED },
        { value: 1, createdAt: 1 }
    )
        .sort({ createdAt: -1 })
        .limit(24)
        .lean();
    const vouchingPhase = Statistics.find(
        { type: TYPE_VOUCHINGPHASE },
        { value: 1, createdAt: 1 }
    )
        .sort({ createdAt: -1 })
        .limit(24)
        .lean();
    const pendingRegistration = Statistics.find(
        {
            type: TYPE_PENDINGREGISTRATION,
        },
        { value: 1, createdAt: 1 }
    )
        .sort({ createdAt: -1 })
        .limit(24)
        .lean();
    const vouched = Statistics.find(
        {
            type: TYPE_VOUCHED,
        },
        { value: 1, createdAt: 1 }
    )
        .sort({ createdAt: -1 })
        .limit(24)
        .lean();

    const [
        resultAll,
        resultRegistered,
        resultVouchingPhase,
        resultPendingRegistration,
        resultVouched,
    ] = await Promise.all([
        all,
        registered,
        vouchingPhase,
        pendingRegistration,
        vouched,
    ]);

    return res.json({
        all: resultAll,
        registered: resultRegistered,
        vouchingPhase: resultVouchingPhase,
        pendingRegistration: resultPendingRegistration,
        vouched: resultVouched,
    });
});

app.get("/api/statistics_days", async (req, res) => {
    const all = Statistics.aggregate([
        {
            $project: {
                value: 1,
                type: 1,
                createdAt: 1,
                hour: { $hour: "$createdAt" },
            },
        },
        { $match: { type: TYPE_ALL, hour: 12 } },
    ])
        .sort({ createdAt: -1 })
        .limit(24)
        .exec();

    const registered = Statistics.aggregate([
        {
            $project: {
                value: 1,
                type: 1,
                createdAt: 1,
                hour: { $hour: "$createdAt" },
            },
        },
        { $match: { type: TYPE_REGISTERED, hour: 12 } },
    ])
        .sort({ createdAt: -1 })
        .limit(24)
        .exec();
    const vouchingPhase = Statistics.aggregate([
        {
            $project: {
                value: 1,
                type: 1,
                createdAt: 1,
                hour: { $hour: "$createdAt" },
            },
        },
        { $match: { type: TYPE_VOUCHINGPHASE, hour: 12 } },
    ])
        .sort({ createdAt: -1 })
        .limit(24)
        .exec();
    const pendingRegistration = Statistics.aggregate([
        {
            $project: {
                value: 1,
                type: 1,
                createdAt: 1,
                hour: { $hour: "$createdAt" },
            },
        },
        { $match: { type: TYPE_PENDINGREGISTRATION, hour: 12 } },
    ])
        .sort({ createdAt: -1 })
        .limit(24)
        .exec();
    const vouched = Statistics.aggregate([
        {
            $project: {
                value: 1,
                type: 1,
                createdAt: 1,
                hour: { $hour: "$createdAt" },
            },
        },
        { $match: { type: TYPE_VOUCHED, hour: 12 } },
    ])
        .sort({ createdAt: -1 })
        .limit(24)
        .exec();

    const [
        resultAll,
        resultRegistered,
        resultVouchingPhase,
        resultPendingRegistration,
        resultVouched,
    ] = await Promise.all([
        all,
        registered,
        vouchingPhase,
        pendingRegistration,
        vouched,
    ]);

    return res.json({
        all: resultAll,
        registered: resultRegistered,
        vouchingPhase: resultVouchingPhase,
        pendingRegistration: resultPendingRegistration,
        vouched: resultVouched,
    });
});

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});
