const { Review, Meta, LastID } = require("./reviewsModel.js");

const updateLastIDOnField = (fieldToUpdate, incrementAmount, callback) => {
  try {
    LastID.findOneAndUpdate(
      {},
      { $inc: { [fieldToUpdate]: incrementAmount } },
      (error, result) => {
        if (error) {
          callback(error, null);
          throw new Error(
            `An error occurred while updating lastID on ${fieldToUpdate} field`
          );
        } else {
          callback(null, result[fieldToUpdate] + incrementAmount);
        }
      }
    );
  } catch (error) {
    console.error(error);
  }
};

const updateAverageValue = (
  addedValue,
  currentAverageValue,
  totalReviews
) =>
  Number.parseFloat(
    (currentAverageValue * totalReviews + addedValue) / (totalReviews + 1)
  ).toFixed(2);

const updateMeta = (review, callback) => {
  try {
    const { product_id, rating, recommend, characteristics } = review;
    let remainingCharacteristicToUpdate =
      Object.keys.values(characteristics).length;
    Meta.findOne({ product_id }).exec((err, result) => {
      if (err) {
        callback(err, null);
        throw new Error(
          `An error occured while finding data to update meta data of product_id: ${product_id}`
        );
      } else {
        // update rating score
        result.rating[rating] = result.rating[rating]
          ? result.rating[rating] + 1
          : 1;
        // update recommended score
        result.recommended[recommend] = result.recommended[recommend]
          ? result.recommended[recommend] + 1
          : 1;
        const productCharacteristics = result.characteristics;
        let currentCharacteristicID;
        // update characteristics
        for (const characteristic in productCharacteristics) {
          // stop iteration if all reviewed characteristics have been updated
          if (remainingCharacteristicToUpdate === 0) {
            break;
          }
          currentCharacteristicID = productCharacteristics[characteristic].id;
          if (currentCharacteristicID in characteristics) {
            productCharacteristics[characteristic]["value"] =
            updateAverageValue(
                characteristics[currentCharacteristicID],
                productCharacteristics[characteristic]["value"],
                result.totalReviews
              );
            remainingCharacteristicToUpdate--;
          }
        }

        Meta.findOneAndUpdate(
          { product_id },
          {
            $set: {
              rating: result.rating,
              recommended: result.recommended,
              characteristics: result.characteristics,
            },
            $inc: { totalReviews: 1 },
          },
          (error, result) => {
            if (error) {
              callback(err, null);
              throw new Error(
                `An error occures while updating meta data of product_id: ${product_id}`
              );
            } else {
              callback(null, result);
            }
          }
        );
      }
    });
  } catch (error) {
    console.error(error);
  }
};

module.exports = {
  getReview: (product_id, page = 1, count = 5, sort, callback) => {
    try {
      const sortedBy = {};
      switch (sort) {
        case "helpful":
          sortedBy.helpfulness = -1;
          break;
        case "date":
          sortedBy.date = -1;
          break;
        default:
          throw new Error("Sort field is not found");
      }
      Review.find({ product_id, reported: false })
        .select("-_id -product_id -reviewer_email -__v")
        .sort(sortedBy)
        .limit(page * count)
        .lean()
        .exec((error, result) => {
          if (error) {
            callback(error, null);
            throw new Error(
              `An error occurred while finding review of this product_id: ${product_id}`
            );
          } else {
            callback(null, {
              product_id,
              page,
              count,
              results: result.slice(page * count - count),
            });
          }
        });
    } catch (error) {
      console.error(error);
    }
  },

  getMeta: (product_id, callback) => {
    try {
      Meta.findOne({ product_id })
        .select("-_id -__v -totalReviews")
        .exec((error, result) => {
          if (error) {
            callback(error, null);
            throw new Error(
              `An error occurred while finding data of this product_id: ${product_id}`
            );
          } else {
            callback(null, result);
          }
        });
    } catch (error) {
      console.error(error);
    }
  },

  addReview: (review, callback) => {
    const defaultFieldsForNewReview = { helpfulness: 0, response: null };
    const updateReviewField = ({ name, email, ...rest }) => ({
      rest,
      ...defaultFieldsForNewReview,
      reviewer_name: name,
      reviewer_email: email,
    });
    const { product_id, photos, characteristics, recommend, rating } =
      updateReviewField(review);

    const updateReviewOnMeta = new Promise((response, reject) =>
      updateMeta(
        { product_id, recommend, rating, characteristics },
        (error, result) => (error ? reject(error) : response(result))
      )
    );
    const udpateLastIDReview = new Promise((response, reject) =>
      updateLastIDOnField("review_id", 1, (error, lastReviewID) =>
        error ? reject(error) : response(lastReviewID)
      )
    );

    Promise.all([updateReviewOnMeta, udpateLastIDReview])
      .then(([_, lastReviewID]) => {
        review.id = lastReviewID;
        if (photos.length) {
          updateLastIDOnField(
            "photo_id",
            photos.length,
            (error, lastPhotoID) => {
              if (error) {
                throw new Error(
                  "An error occurred while updating lastID of photo"
                );
              } else {
                // order photo id based on photo_url order in photos list
                review.photos = photos.map((photo_url, index) => ({
                  id: Number(lastPhotoID) - (photos.length - 1 - index),
                  url: photo_url,
                }));
              }
            }
          );
        }
        new Review(review).save().then((result) => callback(null, result));
      })
      .catch((error) => {
        console.error(error);
      });
  },

  updateField: (review_id, field, callback) => {
    try {
      let updateResult;
      const updateAction = {};
      switch (field) {
        case "helpful":
          updateResult = "Update helpful field succesfully!";
          updateAction["$inc"] = { helpfulness: 1 };
          break;
        case "report":
          updateResult = "Update report review succesfully!";
          updateAction["$set"] = { reported: true };
          break;
        default:
          throw new Error("Field not found");
      }
      Review.findOneAndUpdate({ id: review_id }, updateAction, (err, _) => {
        err ? callback(err, null) : callback(null, updateResult);
      });
    } catch (error) {
      console.error(error);
    }
  },
};
