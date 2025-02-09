import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/apiResponse.js";
import jwt from "jsonwebtoken";
// import mongoose from "mongoose";

const generateAccessAndRefresh = async (userID) => {
  try {
    const user = await User.findById(userID);

    const accessToken = user.generateAccessAndRefresh();
    const refreshToken = user.generateAccessAndRefresh();

    user.refreshToken = refreshToken;

    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "something went wrong while generating and refreshing the acess tokens"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { fullname, username, email, password } = req.body;

  //validation

  if (
    [fullname, username, email, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({ $or: [{ username }, { email }] });

  if (existedUser) {
    throw new ApiError(409, "User Already exist");
  }

  const localAvatarPath = req.files?.avatar[0]?.path;
  const coverLocalPath = req.files?.coverImage[0]?.path;

  let avatar = "";

  try {
    avatar = await uploadOnCloudinary(localAvatarPath);
    console.log(" uploaded avatar", avatar);
  } catch (error) {
    console.log("error uploading avatar", error);
    throw new Error(500, "failed to upload avatar");
  }

  let coverImage = "";
  try {
    coverImage = await uploadOnCloudinary(coverLocalPath);
    console.log(" uploaded cover Image", coverImage);
  } catch (error) {
    console.log("error uploading cover image", error);
    throw new Error(500, "failed to upload cover Image");
  }
  try {
    const user = User.create({
      fullname,
      username: username.toLowerCase(),
      email,
      password,
      avatar: avatar.url,
      coverImage: coverImage?.url || "",
    });

    const createdUser = await User.findById(user._id).select(
      "-password -refreshToken "
    );

    if (!user) {
      throw new ApiError(500, "Something went wrong while registering");
    }

    return res
      .status(201)
      .json(new ApiResponse(200, createdUser, "User Registered"));
  } catch (error) {
    console.log("user creation failed");

    if (avatar) {
      await deleteFromCloudinary(avatar.public_Id);
    }
    if (coverImage) {
      await deleteFromCloudinary(coverImage.public_Id);
    }
    throw new ApiError(
      500,
      "Something went wrong while registering and images are deleted"
    );
  }
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;

  //validation
  if (!email) {
    throw new ApiError(400, "email is required");
  }

  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // validate password

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "invalid credentials");
  }
  const { accessToken, refreshToken } = await generateAccessAndRefresh(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password, -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  return res
    .status(200)
    .cookie("-accessToken", accessToken, options)
    .cookie("-refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "user logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefeshToken = req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefeshToken) {
    throw new ApiError(401, "refresh token is required");
  }

  try {
    const decodeToken = jwt.verify(
      incomingRefeshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    const user = await User.findById(decodeToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }
    if (incomingRefeshToken !== user?.refreshToken) {
      throw new ApiError(401, "Invalid refresh token");
    }
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    };

    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefresh(user._id);

    return res
      .status(200)
      .cookie("-accessToken", accessToken, options)
      .cookie("-refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { user: newRefreshToken },
          "Access refreshed token successfully"
        )
      );
  } catch (error) {
    throw new Error(500, "something went wrong while refreshing acess token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user?._id);

  const isPasswordValid = await isSecureContext.isPasswordCorrect(oldPassword);

  if (!isPasswordValid) {
    throw new ApiError(401, "Old password is incorrect");
  }

  user.password = newPassword;

  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully "));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, req.user, "current user details"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullname, email } = req.body;

  if (!fullname || !email) {
    throw new ApiError(400, "fullname and email are required");
  }

  const user = User.findByIdAndUpdate(
    req.user?._id,
    {
      set: {
        fullname,
        email: email,
      },
    },
    {
      new: true,
    }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const localAvatarPath = req.files?.path;

  if (!localAvatarPath) {
    throw new Error(400, "File is required");
  }

  const avatar = await uploadOnCloudinary(localAvatarPath);

  if (!avatar.url) {
    throw new Error(500, "something went wrong while uplodaing avatar file");
  }

  const user = await User.findById(
    req.user?._id,
    {
      set: {
        avatar: avatar.url,
      },
    },
    {
      new: true,
    }
  ).select("-password -refreshToken");

  res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar updated successfully"));
});
const updateCoverImage = asyncHandler(async (req, res) => {
  const coverLocalPath = req.file?.path;

  if (!coverLocalPath) {
    throw new ApiError(400, "file is required");
  }

  const coverImage = await uploadOnCloudinary(coverLocalPath);

  if (!coverImage.url) {
    throw new ApiError(500, "something went wrong while uplodaing cover Image");
  }

  const user = User.findById(
    req.user?._id,
    {
      set: {
        coverImage: coverImage.url,
      },
    },
    {
      new: true,
    }
  );

  res
    .status(200)
    .json(new ApiResponse(200, user, "Cover Image updated successfully"));
});

const getUserChnannelProfile = asyncHandler(async (req, res) => {
  const { userName } = req.params;

  if (!userName?.trim()) {
    throw new ApiError(400, "Username is required");
  }

  const channel = await User.aggregate([
    {
      $match: {
        username: userName.toLowerCase(),
      },
    },
    {
      $lookup: {
        from: "subscription",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers ",
      },
    },
    {
      $lookup: {
        from: "subscription",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers",
        },
        channelsSubscribedTo: {
          $size: "$subscribedTo",
        },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "subscribers.subscribe"] },
          },
        },
      },
    },
    {
      //project only necessiry data
      $project: {
        fullname: 1,
        userName: 1,
        avatar: 1,
        subscribersCount: 1,
        channelsSubscribedTo: 1,
        isSubscribed: 1,
        coverImage: 1,
        email: 1,
      },
    },
  ]);

  if (!channel.length) {
    throw new ApiError(404, "channel mot found");
  }

  res
    .status(200)
    .json(new ApiResponse(200, channel[0], "channel fetched successfully"));
});
const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user?._id),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
      },
      pipeline: [
        {
          $lookup: {
            from: "user",
            localField: "owner",
            foreignField: "_id",
            as: "owner",
            pipeline: [
              {
                $project: {
                  fullname: 1,
                  username: 1,
                  avatar: 1,
                },
              },
            ],
          },
        },
        {
          $addFields: {
            owner: {
              $first: "owner",
            },
          },
        },
      ],
    },
  ]);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0]?.watchHistory,
        "watch hitsory fetched successfully"
      )
    );
});

export {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateCoverImage,
  getUserChnannelProfile,
  getWatchHistory,
};
